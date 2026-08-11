import { randomBytes } from "node:crypto";
import type { CloudClient, CloudTask } from "./types.js";
import { listTasks, loadTask, saveTask, type StoredTask } from "./store.js";
import { runCloudTaskLocally } from "./runner.js";

export class FileCloudClient implements CloudClient {
  constructor(private readonly repoRoot: string) {}

  async submit(prompt: string): Promise<CloudTask> {
    const id = `task_${Date.now().toString(36)}_${randomBytes(2).toString("hex")}`;
    const now = new Date().toISOString();
    const task: StoredTask = {
      id,
      prompt,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    saveTask(this.repoRoot, task);
    return task;
  }

  async get(id: string): Promise<CloudTask | undefined> {
    return loadTask(this.repoRoot, id);
  }

  async list(): Promise<CloudTask[]> {
    return listTasks(this.repoRoot);
  }

  /** Queue then immediately run on a local worktree runner (headless). */
  async submitAndRun(prompt: string): Promise<StoredTask> {
    const task = await this.submit(prompt);
    return runCloudTaskLocally({ repoRoot: this.repoRoot, taskId: task.id });
  }
}

/** @deprecated use FileCloudClient — kept for unit tests of the original stub shape */
export class InMemoryCloudClient implements CloudClient {
  private readonly tasks = new Map<string, CloudTask>();

  async submit(prompt: string): Promise<CloudTask> {
    const task: CloudTask = {
      id: `task_${this.tasks.size + 1}`,
      prompt,
      status: "queued",
    };
    this.tasks.set(task.id, task);
    return task;
  }

  async get(id: string): Promise<CloudTask | undefined> {
    return this.tasks.get(id);
  }

  async list(): Promise<CloudTask[]> {
    return [...this.tasks.values()];
  }
}
