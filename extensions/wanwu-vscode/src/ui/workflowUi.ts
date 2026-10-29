import {
  workflowPhase,
  workflowPhaseIndex,
  workflowPhaseLabel,
  workflowStateLabel,
  type WorkflowPhase,
  type WorkflowState,
} from "@wanwu/workflow";

const CHAIN: WorkflowPhase[] = ["explore", "plan", "act", "verify", "done"];

export function workflowWebviewPayload(state: string): {
  state: WorkflowState;
  detail: string;
  phase: WorkflowPhase;
  phaseIndex: number;
  steps: Array<{ id: WorkflowPhase; label: string; done: boolean; current: boolean }>;
} {
  const ws = state as WorkflowState;
  const phase = workflowPhase(ws);
  const activeIdx = workflowPhaseIndex(phase);
  return {
    state: ws,
    detail: workflowStateLabel(ws),
    phase,
    phaseIndex: activeIdx,
    steps: CHAIN.map((step, i) => ({
      id: step,
      label: workflowPhaseLabel(step),
      done: i < activeIdx,
      current: i === activeIdx,
    })),
  };
}

export function formatUsageLine(usage?: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): string | undefined {
  if (!usage) return undefined;
  if (usage.inputTokens === undefined && usage.outputTokens === undefined) return undefined;
  return `tokens in ${usage.inputTokens ?? 0} / out ${usage.outputTokens ?? 0}`;
}
