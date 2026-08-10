/**
 * Plan → Act → Verify state machine (Claude Code inspired, Wanwu productized).
 */

export type WorkflowState =
  | "idle"
  | "explore"
  | "plan_draft"
  | "plan_approved"
  | "acting"
  | "verifying"
  | "done"
  | "failed";

export type WorkflowEvent =
  | "start_explore"
  | "draft_plan"
  | "approve_plan"
  | "reject_plan"
  | "start_act"
  | "start_verify"
  | "verify_pass"
  | "verify_fail"
  | "reset";

const TRANSITIONS: Record<WorkflowState, Partial<Record<WorkflowEvent, WorkflowState>>> = {
  idle: { start_explore: "explore", draft_plan: "plan_draft", start_act: "acting" },
  explore: { draft_plan: "plan_draft", start_act: "acting", reset: "idle" },
  plan_draft: { approve_plan: "plan_approved", reject_plan: "plan_draft", reset: "idle" },
  plan_approved: { start_act: "acting", reject_plan: "plan_draft", reset: "idle" },
  acting: { start_verify: "verifying", reset: "idle" },
  verifying: { verify_pass: "done", verify_fail: "acting", reset: "idle" },
  done: { reset: "idle", start_explore: "explore" },
  failed: { reset: "idle" },
};

export class WorkflowMachine {
  state: WorkflowState;

  constructor(initial: WorkflowState = "idle") {
    this.state = initial;
  }

  can(event: WorkflowEvent): boolean {
    return Boolean(TRANSITIONS[this.state][event]);
  }

  send(event: WorkflowEvent): WorkflowState {
    const next = TRANSITIONS[this.state][event];
    if (!next) {
      throw new Error(`Invalid transition: ${this.state} + ${event}`);
    }
    this.state = next;
    return this.state;
  }
}

/** Verify must not share Act's polluted context — marker for orchestrators. */
export const VERIFY_ISOLATION = "separate-subagent-or-fresh-session" as const;