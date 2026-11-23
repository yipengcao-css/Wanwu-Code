import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { WorkflowMachine } from "@wanwu/workflow";
import { bumpWorkflowAfterVerify, bumpWorkflowForMode } from "./workflowSession.js";

describe("workflowSession emit", () => {
  it("writes workflow_state session updates", () => {
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const wf = new WorkflowMachine();
      const sid = "test-session";
      bumpWorkflowForMode(wf, sid, "ask");
      assert.match(lines.at(-1) ?? "", /workflow_state/);
      assert.match(lines.at(-1) ?? "", /explore/);

      bumpWorkflowForMode(wf, sid, "plan");
      assert.equal(wf.state, "plan_draft");

      bumpWorkflowForMode(wf, sid, "agent", { executePlan: true });
      assert.equal(wf.state, "acting");

      bumpWorkflowForMode(wf, sid, "verify");
      assert.equal(wf.state, "verifying");

      bumpWorkflowAfterVerify(wf, sid, true);
      assert.equal(wf.state, "done");
    } finally {
      process.stdout.write = orig;
    }
  });
});
