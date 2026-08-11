import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WorkflowMachine } from "@wanwu/workflow";
import { discoverMemory } from "./memory.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export function runPlan(task: string, cwd: string = findWorkspaceRoot()): string {
  const wf = new WorkflowMachine();
  wf.send("start_explore");
  wf.send("draft_plan");

  const memory = discoverMemory(cwd);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(cwd, ".wanwu", "plans");
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `${stamp}.plan.md`);

  const body = `# Wanwu Plan

- created: ${new Date().toISOString()}
- workflow_state: ${wf.state}
- memory: ${memory.map((m) => m.kind).join(", ") || "(none)"}

## Task

${task}

## Proposed Steps

1. Explore relevant files and failing tests/diagnostics
2. Implement the smallest correct change
3. Run Verify (test/lint/typecheck)
4. Summarize diff and commit message (do not push)

## Risks

- Avoid unrelated refactors
- Respect permissionMode / sandbox

## Approval

Reply with \`wanwu\` Agent mode after reviewing this plan, or edit this file first.
`;

  writeFileSync(outPath, body, "utf8");
  if (process.env.WANWU_PLAN_QUIET !== "1") {
    console.log(outPath);
  }
  return outPath;
}