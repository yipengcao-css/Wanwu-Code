import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureTasksRoot, loadTask, saveTask, updateTaskStatus, type StoredTask } from "./store.js";

export interface RunOptions {
  repoRoot: string;
  taskId: string;
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  logFile: string,
  env: NodeJS.ProcessEnv = process.env,
): number {
  appendFileSync(logFile, `\n$ (cwd=${cwd}) ${cmd} ${args.join(" ")}\n`, "utf8");
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", env });
  if (result.stdout) appendFileSync(logFile, result.stdout, "utf8");
  if (result.stderr) appendFileSync(logFile, result.stderr, "utf8");
  return result.status ?? 1;
}

export function worktreePath(repoRoot: string, taskId: string): string {
  return join(repoRoot, ".wanwu", "worktrees", taskId);
}

/**
 * Create an isolated worktree and run plan → review artifact → diff (never merges to main).
 * All plan/review writes happen inside the worktree cwd.
 */
export function runCloudTaskLocally(opts: RunOptions): StoredTask {
  const { repoRoot, taskId } = opts;
  const task = loadTask(repoRoot, taskId);
  if (!task) {
    throw new Error(`unknown task ${taskId}`);
  }

  const taskDir = join(ensureTasksRoot(repoRoot), taskId);
  const logPath = join(taskDir, "runner.log");
  writeFileSync(logPath, `wanwu cloud runner start ${new Date().toISOString()}\n`, "utf8");

  updateTaskStatus(repoRoot, taskId, "running", { logPath });

  const branch = `wanwu/cloud-${taskId}`;
  const wt = worktreePath(repoRoot, taskId);
  mkdirSync(join(repoRoot, ".wanwu", "worktrees"), { recursive: true });

  if (!existsSync(wt)) {
    const addCode = run(
      "git",
      ["worktree", "add", "-b", branch, wt, "HEAD"],
      repoRoot,
      logPath,
    );
    if (addCode !== 0) {
      return updateTaskStatus(repoRoot, taskId, "failed", {
        exitCode: addCode,
        logPath,
        worktree: wt,
        branch,
      });
    }
  }

  // Isolation marker (proves tasks don't clobber each other / main)
  const markerRel = join(".wanwu", "cloud-markers", `${taskId}.txt`);
  const markerAbs = join(wt, markerRel);
  mkdirSync(join(wt, ".wanwu", "cloud-markers"), { recursive: true });
  writeFileSync(markerAbs, `task=${taskId}\nprompt=${task.prompt}\n`, "utf8");

  // Prefer packaged CLI if present; else tsx from monorepo entry
  const bundled = join(repoRoot, "dist-bin", "wanwu.mjs");
  const cliEntry = join(repoRoot, "packages/wanwu-cli/src/index.ts");
  let planCode: number;
  if (existsSync(bundled)) {
    planCode = run(process.execPath, [bundled, "plan", "-p", task.prompt], wt, logPath);
  } else if (existsSync(cliEntry)) {
    planCode = run(
      "pnpm",
      ["exec", "tsx", cliEntry, "plan", "-p", task.prompt],
      wt,
      logPath,
      { ...process.env, WANWU_WORKDIR: wt },
    );
  } else {
    // Minimal plan fallback when CLI sources unavailable (e.g. tiny test repos)
    const plansDir = join(wt, ".wanwu", "plans");
    mkdirSync(plansDir, { recursive: true });
    const planFile = join(plansDir, `${taskId}.plan.md`);
    writeFileSync(
      planFile,
      `# Wanwu Plan\n\n- task: ${taskId}\n\n## Task\n\n${task.prompt}\n`,
      "utf8",
    );
    planCode = 0;
    appendFileSync(logPath, `\n[fallback plan written] ${planFile}\n`, "utf8");
  }

  const reviewNote = join(wt, ".wanwu", "cloud-review.md");
  mkdirSync(join(wt, ".wanwu"), { recursive: true });
  writeFileSync(
    reviewNote,
    `# Cloud task review (do not merge automatically)\n\n- task: ${taskId}\n- prompt: ${task.prompt}\n- planExit: ${planCode}\n- marker: ${markerRel}\n`,
    "utf8",
  );

  run("git", ["add", ".wanwu"], wt, logPath);
  run(
    "git",
    [
      "-c",
      "user.email=wanwu@example.com",
      "-c",
      "user.name=Wanwu Cloud",
      "commit",
      "-m",
      `wanwu cloud task ${taskId}: review artifact (no merge)`,
    ],
    wt,
    logPath,
  );

  const diffPath = join(taskDir, "review.diff");
  const diff = spawnSync("git", ["diff", "HEAD~1..HEAD"], { cwd: wt, encoding: "utf8" });
  writeFileSync(diffPath, diff.stdout ?? "", "utf8");
  appendFileSync(logPath, `\n[review.diff written — review-first, not merged to main]\n`, "utf8");

  const ok = planCode === 0 && (diff.stdout ?? "").length > 0;
  const next = updateTaskStatus(repoRoot, taskId, ok ? "succeeded" : "failed", {
    worktree: wt,
    branch,
    logPath,
    diffPath,
    exitCode: planCode,
  });
  saveTask(repoRoot, next);
  return next;
}
