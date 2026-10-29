import {
  syncWorkflowAfterVerify,
  syncWorkflowFromMode,
  type AgentUiMode,
  type WorkflowState,
  WorkflowMachine,
} from "@wanwu/workflow";
import { sessionUpdate } from "./jsonRpcStdio.js";

export function emitWorkflowState(sessionId: string, state: WorkflowState): void {
  sessionUpdate(sessionId, {
    sessionUpdate: "workflow_state",
    workflowState: state,
  });
}

export function bumpWorkflowForMode(
  wf: WorkflowMachine,
  sessionId: string,
  mode: AgentUiMode,
  opts?: { executePlan?: boolean },
): WorkflowState {
  const state = syncWorkflowFromMode(wf, mode, opts);
  emitWorkflowState(sessionId, state);
  return state;
}

export function bumpWorkflowAfterVerify(
  wf: WorkflowMachine,
  sessionId: string,
  passed: boolean,
): WorkflowState {
  const state = syncWorkflowAfterVerify(wf, passed);
  emitWorkflowState(sessionId, state);
  return state;
}
