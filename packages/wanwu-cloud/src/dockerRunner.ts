import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCloudTaskLocally } from "./runner.js";
import { ensureTasksRoot, loadTask, saveTask, updateTaskStatus, type StoredTask } from "./store.js";

const DEFAULT_IMAGE = "node:20.18.0-bookworm-slim";

function dockerCmd(): string[] {
  const direct = spawnSync("docker", ["info"], { encoding: "utf8" });
  if ((direct.status ?? 1) === 0) {
    return ["docker"];
  }
  const elevated = spawnSync("sudo", ["docker", "info"], { encoding: "utf8" });
  if ((elevated.status ?? 1) === 0) {
    return ["sudo", "docker"];
  }
  return ["docker"];
}

export function dockerAvailable(): boolean {
  const prefix = dockerCmd();
  const bin = prefix[0]!;
  const args = bin === "sudo" ? ["docker", "info"] : ["info"];
  return (spawnSync(bin, args, { encoding: "utf8" }).status ?? 1) === 0;
}

function runDocker(args: string[], opts: { cwd: string; inherit?: boolean }) {
  const prefix = dockerCmd();
  const bin = prefix[0]!;
  const fullArgs = bin === "sudo" ? ["docker", ...args] : args;
  return spawnSync(bin, fullArgs, {
    cwd: opts.cwd,
    encoding: "utf8",
    stdio: opts.inherit ? "inherit" : undefined,
  });
}

/** Build argv for `docker run ...` (exported for unit tests). */
export function buildDockerRunArgs(opts: {
  repoRoot: string;
  taskId: string;
  prompt: string;
  image?: string;
}): string[] {
  const entry = join(opts.repoRoot, "apps/wanwu-cloud-runner/scripts/entrypoint.sh");
  return [
    "run",
    "--rm",
    "-v",
    `${opts.repoRoot}:/workspace`,
    "-v",
    `${entry}:/entrypoint.sh:ro`,
    "-w",
    "/workspace",
    "-e",
    `WANWU_CLOUD_TASK_ID=${opts.taskId}`,
    "-e",
    `WANWU_CLOUD_PROMPT=${opts.prompt}`,
    opts.image ?? DEFAULT_IMAGE,
    "bash",
    "/entrypoint.sh",
  ];
}

export function buildDockerRunnerImage(repoRoot: string): number {
  const dockerfile = join(repoRoot, "apps/wanwu-cloud-runner/Dockerfile");
  if (!existsSync(dockerfile)) {
    throw new Error(`missing Dockerfile: ${dockerfile}`);
  }
  const result = runDocker(
    ["build", "-f", dockerfile, "-t", "wanwu-cloud-runner:local", repoRoot],
    { cwd: repoRoot, inherit: true },
  );
  return result.status ?? 1;
}

/** Exported for unit tests. */
export function isNestedOverlayFailure(stderr: string, status: number | null): boolean {
  if (status === 125) return true;
  return /overlay|invalid argument|containerd-mount/i.test(stderr);
}

/** Exported for unit tests. */
export function shouldRefuseDockerFallback(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WANWU_DOCKER_REQUIRE === "1";
}

/**
 * Prefer real Docker execution; on nested-overlay hosts (common in cloud VMs),
 * fall back to the local worktree runner while preserving docker artifacts/logs.
 */
export function runCloudTaskInDocker(opts: {
  repoRoot: string;
  taskId: string;
  rebuild?: boolean;
}): StoredTask {
  const { repoRoot, taskId, rebuild } = opts;
  if (!dockerAvailable()) {
    throw new Error("Docker is not available. Install Docker or use `wanwu cloud submit --run`.");
  }

  const task = loadTask(repoRoot, taskId);
  if (!task) {
    throw new Error(`unknown task ${taskId}`);
  }

  const taskDir = join(ensureTasksRoot(repoRoot), taskId);
  mkdirSync(taskDir, { recursive: true });
  const logPath = join(taskDir, "docker-runner.log");
  writeFileSync(logPath, `wanwu cloud docker runner ${new Date().toISOString()}\n`, "utf8");
  updateTaskStatus(repoRoot, taskId, "running", { logPath });

  let image = DEFAULT_IMAGE;
  if (rebuild) {
    const code = buildDockerRunnerImage(repoRoot);
    if (code === 0) image = "wanwu-cloud-runner:local";
  } else {
    const inspect = runDocker(["image", "inspect", "wanwu-cloud-runner:local"], { cwd: repoRoot });
    if ((inspect.status ?? 1) === 0) image = "wanwu-cloud-runner:local";
  }

  const args = buildDockerRunArgs({
    repoRoot,
    taskId,
    prompt: task.prompt,
    image,
  });
  writeFileSync(
    logPath,
    `${readFileSync(logPath, "utf8")}docker argv: docker ${args.join(" ")}\n`,
    "utf8",
  );

  const result = runDocker(args, { cwd: repoRoot });
  const stderr = result.stderr ?? "";
  writeFileSync(
    logPath,
    `${readFileSync(logPath, "utf8")}\nimage=${image}\n--- docker stdout ---\n${result.stdout ?? ""}\n--- docker stderr ---\n${stderr}\nexit=${result.status}\n`,
    "utf8",
  );

  if ((result.status ?? 1) === 0) {
    const refreshed = loadTask(repoRoot, taskId);
    const next: StoredTask = {
      ...(refreshed ?? task),
      status: refreshed?.status === "succeeded" ? "succeeded" : "failed",
      updatedAt: new Date().toISOString(),
      logPath,
      exitCode: result.status ?? 0,
    };
    saveTask(repoRoot, next);
    return next;
  }

  if (isNestedOverlayFailure(stderr, result.status)) {
    const requireDocker = process.env.WANWU_DOCKER_REQUIRE === "1";
    if (requireDocker) {
      writeFileSync(
        logPath,
        `${readFileSync(logPath, "utf8")}\n[require] WANWU_DOCKER_REQUIRE=1 — refusing nested-overlay fallback\n`,
        "utf8",
      );
      return updateTaskStatus(repoRoot, taskId, "failed", {
        exitCode: result.status ?? 1,
        logPath,
      });
    }
    writeFileSync(
      logPath,
      `${readFileSync(logPath, "utf8")}\n[fallback] docker run failed on nested overlay; using local worktree runner\n`,
      "utf8",
    );
    const local = runCloudTaskLocally({ repoRoot, taskId });
    const merged: StoredTask = {
      ...local,
      logPath,
      updatedAt: new Date().toISOString(),
    };
    // keep docker log path as primary log
    const combined = `${readFileSync(logPath, "utf8")}\n--- local fallback log ---\n${
      local.logPath && existsSync(local.logPath) ? readFileSync(local.logPath, "utf8") : ""
    }\n`;
    writeFileSync(logPath, combined, "utf8");
    saveTask(repoRoot, merged);
    return merged;
  }

  return updateTaskStatus(repoRoot, taskId, "failed", {
    exitCode: result.status ?? 1,
    logPath,
  });
}