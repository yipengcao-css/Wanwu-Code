import type { WorkflowState } from "./index.js";
import { WorkflowMachine } from "./index.js";

/** UI / CLI mode tags (matches Shell OrbitBar and `[MODE=…]` prompts). */
export type AgentUiMode = "ask" | "plan" | "agent" | "verify" | "debug";

function trySend(wf: WorkflowMachine, event: Parameters<WorkflowMachine["send"]>[0]): void {
  if (wf.can(event)) wf.send(event);
}

/**
 * Best-effort align WorkflowMachine with the user's selected mode before a turn.
 * Invalid transitions are skipped (never throws).
 */
export function syncWorkflowFromMode(
  wf: WorkflowMachine,
  mode: AgentUiMode,
  opts?: { executePlan?: boolean },
): WorkflowState {
  if (mode === "ask") {
    trySend(wf, "start_explore");
  }
  if (mode === "plan") {
    if (wf.state === "idle") trySend(wf, "start_explore");
    trySend(wf, "draft_plan");
  }
  if (mode === "agent") {
    if (opts?.executePlan || wf.state === "plan_draft") {
      trySend(wf, "approve_plan");
    }
    trySend(wf, "start_act");
  }
  if (mode === "verify") {
    if (wf.state === "plan_draft" || wf.state === "plan_approved") {
      trySend(wf, "approve_plan");
    }
    if (wf.state !== "acting" && wf.state !== "verifying") {
      trySend(wf, "start_act");
    }
    trySend(wf, "start_verify");
  }
  if (mode === "debug" && wf.state === "idle") {
    trySend(wf, "start_explore");
  }
  return wf.state;
}

export function syncWorkflowAfterVerify(wf: WorkflowMachine, passed: boolean): WorkflowState {
  if (passed) trySend(wf, "verify_pass");
  else trySend(wf, "verify_fail");
  return wf.state;
}

export type WorkflowPhase = "explore" | "plan" | "act" | "verify" | "done";

const PHASE_ORDER: WorkflowPhase[] = ["explore", "plan", "act", "verify", "done"];

export function workflowPhase(state: WorkflowState): WorkflowPhase {
  if (state === "done") return "done";
  if (state === "verifying") return "verify";
  if (state === "acting" || state === "failed") return "act";
  if (state === "plan_draft" || state === "plan_approved") return "plan";
  return "explore";
}

export function workflowPhaseIndex(phase: WorkflowPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

export function workflowPhaseLabel(phase: WorkflowPhase): string {
  const labels: Record<WorkflowPhase, string> = {
    explore: "探索",
    plan: "计划",
    act: "执行",
    verify: "验证",
    done: "完成",
  };
  return labels[phase];
}

export function workflowStateLabel(state: WorkflowState): string {
  const labels: Record<WorkflowState, string> = {
    idle: "就绪",
    explore: "探索中",
    plan_draft: "计划草稿",
    plan_approved: "计划已批准",
    acting: "执行中",
    verifying: "验证中",
    done: "已完成",
    failed: "失败",
  };
  return labels[state];
}
