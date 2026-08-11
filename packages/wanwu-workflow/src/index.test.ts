import { describe, expect, it } from "vitest";
import { VERIFY_ISOLATION, WorkflowMachine } from "./index.js";

describe("wanwu-workflow", () => {
  it("supports explore → plan → act → verify → done", () => {
    const wf = new WorkflowMachine();
    expect(wf.send("start_explore")).toBe("explore");
    expect(wf.send("draft_plan")).toBe("plan_draft");
    expect(wf.send("approve_plan")).toBe("plan_approved");
    expect(wf.send("start_act")).toBe("acting");
    expect(wf.send("start_verify")).toBe("verifying");
    expect(wf.send("verify_pass")).toBe("done");
  });

  it("returns to acting when verify fails", () => {
    const wf = new WorkflowMachine("verifying");
    expect(wf.send("verify_fail")).toBe("acting");
  });

  it("rejects illegal transitions", () => {
    const wf = new WorkflowMachine("idle");
    expect(() => wf.send("verify_pass")).toThrow(/Invalid transition/);
  });

  it("documents verify isolation policy", () => {
    expect(VERIFY_ISOLATION).toContain("separate");
  });
});