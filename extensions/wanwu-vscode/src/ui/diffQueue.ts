import type { AcpEditProposal } from "../acp/client";
import { isNoOpDiff } from "./diffPaths";
import { reviewSingleFileDiff } from "./diffReview";

export { isNoOpDiff } from "./diffPaths";

/**
 * Serial multi-file diff review (matches Shell edit queue: skip no-op, one file at a time).
 */
export class DiffReviewQueue {
  private readonly pending: AcpEditProposal[] = [];
  private draining = false;

  size(): number {
    return this.pending.length;
  }

  enqueue(
    edit: AcpEditProposal,
    workspaceRoot: string | undefined,
    hooks: {
      onStatus: (text: string) => void;
      onResolved: (edit: AcpEditProposal, decision: "accept" | "reject") => void;
    },
  ): void {
    if (isNoOpDiff(edit)) return;
    const rest = this.pending.filter((e) => e.path !== edit.path);
    rest.push(edit);
    this.pending.length = 0;
    this.pending.push(...rest);
    void this.drain(workspaceRoot, hooks);
  }

  private async drain(
    workspaceRoot: string | undefined,
    hooks: {
      onStatus: (text: string) => void;
      onResolved: (edit: AcpEditProposal, decision: "accept" | "reject") => void;
    },
  ): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length > 0) {
        const edit = this.pending[0]!;
        const queueLabel = this.pending.length > 1 ? ` · 队列 ${this.pending.length} 个文件` : "";
        hooks.onStatus(`审阅 ${edit.path}${queueLabel}`);
        const decision = await reviewSingleFileDiff(edit, workspaceRoot);
        this.pending.shift();
        hooks.onResolved(edit, decision);
      }
    } finally {
      this.draining = false;
    }
  }
}
