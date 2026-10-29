import {
  workflowPhase,
  workflowPhaseIndex,
  workflowPhaseLabel,
  workflowStateLabel,
  type WorkflowPhase,
  type WorkflowState,
} from "@wanwu/workflow";

const CHAIN: WorkflowPhase[] = ["explore", "plan", "act", "verify", "done"];

export function WorkflowRail(props: { state: WorkflowState | null }) {
  if (!props.state) return null;
  const phase = workflowPhase(props.state);
  const activeIdx = workflowPhaseIndex(phase);
  const detail = workflowStateLabel(props.state);

  return (
    <nav className="workflow-rail" aria-label="工作流进度 Explore → Plan → Act → Verify → Commit">
      <ol>
        {CHAIN.map((step, i) => {
          const done = i < activeIdx;
          const current = i === activeIdx;
          return (
            <li key={step} className={done ? "done" : current ? "current" : ""} title={detail}>
              <span className="workflow-dot" aria-hidden />
              <span className="workflow-label">{workflowPhaseLabel(step)}</span>
            </li>
          );
        })}
      </ol>
      <span className="workflow-detail">{detail}</span>
    </nav>
  );
}
