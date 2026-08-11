export type CloudTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface CloudTask {
  id: string;
  prompt: string;
  status: CloudTaskStatus;
  worktree?: string;
  branch?: string;
  /** Draft PR URL when opened via `wanwu cloud … --pr` */
  prUrl?: string;
  prDraftPath?: string;
}

export interface CloudClient {
  submit(prompt: string): Promise<CloudTask>;
  get(id: string): Promise<CloudTask | undefined>;
  list(): Promise<CloudTask[]>;
}