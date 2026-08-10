import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CloudTask, CloudTaskStatus } from "./types.js";

export interface StoredTask extends CloudTask {
  createdAt: string;
  updatedAt: string;
  logPath?: string;
  diffPath?: string;
  exitCode?: number;
}

export function tasksRoot(repoRoot: string): string {
  return join(repoRoot, ".wanwu", "cloud-tasks");
}

export function ensureTasksRoot(repoRoot: string): string {
  const root = tasksRoot(repoRoot);
  mkdirSync(root, { recursive: true });
  return root;
}

export function saveTask(repoRoot: string, task: StoredTask): void {
  const dir = join(ensureTasksRoot(repoRoot), task.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "task.json"), JSON.stringify(task, null, 2), "utf8");
}

export function loadTask(repoRoot: string, id: string): StoredTask | undefined {
  const file = join(tasksRoot(repoRoot), id, "task.json");
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as StoredTask;
}

export function listTasks(repoRoot: string): StoredTask[] {
  const root = tasksRoot(repoRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((id) => loadTask(repoRoot, id))
    .filter((t): t is StoredTask => Boolean(t))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function updateTaskStatus(
  repoRoot: string,
  id: string,
  status: CloudTaskStatus,
  patch: Partial<StoredTask> = {},
): StoredTask {
  const current = loadTask(repoRoot, id);
  if (!current) {
    throw new Error(`unknown cloud task: ${id}`);
  }
  const next: StoredTask = {
    ...current,
    ...patch,
    status,
    updatedAt: new Date().toISOString(),
  };
  saveTask(repoRoot, next);
  return next;
}