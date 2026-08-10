/**
 * Cloud async agents (Codex-inspired) — Phase 5 stub.
 */

export type CloudTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface CloudTask {
  id: string;
  prompt: string;
  status: CloudTaskStatus;
  worktree?: string;
}

export interface CloudClient {
  submit(prompt: string): Promise<CloudTask>;
  get(id: string): Promise<CloudTask | undefined>;
}

/** Local in-memory stub so the package is importable before real runners exist. */
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
}