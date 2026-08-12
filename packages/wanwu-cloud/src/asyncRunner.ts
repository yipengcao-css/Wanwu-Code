import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureTasksRoot, loadTask, updateTaskStatus } from "./store.js";

export interface AsyncRunHandle {
  taskId: string;
  pid: number;
  logPath: string;
}

/**
 * Spawn a detached background runner for a queued task.
 * The runner re-invokes `wanwu cloud run <taskId>` in a child process.
 */
export function startCloudTaskAsync(opts: {
  repoRoot: string;
  taskId: string;
  cliEntry?: string;
}): AsyncRunHandle {
  const { repoRoot, taskId } = opts;
  const task = loadTask(repoRoot, taskId);
  if (!task) {
    throw new Error(`unknown task ${taskId}`);
  }
  if (task.status === "running") {
    throw new Error(`task already running: ${taskId}`);
  }

  const taskDir = join(ensureTasksRoot(repoRoot), taskId);
  mkdirSync(taskDir, { recursive: true });
  const logPath = join(taskDir, "runner.log");
  writeFileSync(logPath, `wanwu cloud async runner start ${new Date().toISOString()}\n`, "utf8");

  const cliEntry =
    opts.cliEntry ??
    join(repoRoot, "packages", "wanwu-cli", "src", "index.ts");

  const child = spawn(
    "pnpm",
    ["exec", "tsx", cliEntry, "cloud", "run", taskId],
    {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );

  child.stdout?.on("data", (d: Buffer) => {
    writeFileSync(logPath, d, { flag: "a" });
  });
  child.stderr?.on("data", (d: Buffer) => {
    writeFileSync(logPath, d, { flag: "a" });
  });

  updateTaskStatus(repoRoot, taskId, "running", { logPath });
  child.unref();

  return { taskId, pid: child.pid ?? -1, logPath };
}

export function isTaskRunning(repoRoot: string, taskId: string): boolean {
  const task = loadTask(repoRoot, taskId);
  return task?.status === "running";
}
