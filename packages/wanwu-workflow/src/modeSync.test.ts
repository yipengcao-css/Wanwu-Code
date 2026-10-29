import { describe, expect, it } from "vitest";
import { WorkflowMachine } from "./index.js";
import {
  syncWorkflowAfterVerify,
  syncWorkflowFromMode,
  workflowPhase,
  workflowPhaseLabel,
} from "./modeSync.js";

describe("workflow mode sync", () => {
  it("ask moves idle → explore", () => {
    const wf = new WorkflowMachine();
    expect(syncWorkflowFromMode(wf, "ask")).toBe("explore");
  });

  it("plan from explore → plan_draft", () => {
    const wf = new WorkflowMachine("explore");
    expect(syncWorkflowFromMode(wf, "plan")).toBe("plan_draft");
  });

  it("agent after plan approves and acts", () => {
    const wf = new WorkflowMachine("plan_draft");
    expect(syncWorkflowFromMode(wf, "agent", { executePlan: true })).toBe("acting");
  });

  it("verify from idle → verifying", () => {
    const wf = new WorkflowMachine();
    expect(syncWorkflowFromMode(wf, "verify")).toBe("verifying");
  });

  it("verify from acting → verifying", () => {
    const wf = new WorkflowMachine("acting");
    expect(syncWorkflowFromMode(wf, "verify")).toBe("verifying");
  });

  it("verify pass → done", () => {
    const wf = new WorkflowMachine("verifying");
    expect(syncWorkflowAfterVerify(wf, true)).toBe("done");
  });

  it("verify fail → acting", () => {
    const wf = new WorkflowMachine("verifying");
    expect(syncWorkflowAfterVerify(wf, false)).toBe("acting");
  });

  it("maps phases for UI rail", () => {
    expect(workflowPhase("plan_draft")).toBe("plan");
    expect(workflowPhaseLabel("verify")).toBe("验证");
  });
});
