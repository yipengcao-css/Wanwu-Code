import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { completeChat, hasProviderCredentials } from "@wanwu/providers";
import { loadWanwuConfig } from "@wanwu/config";
import { WorkflowMachine } from "@wanwu/workflow";
import { discoverMemory, renderMemoryForPrompt } from "./memory.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";

function planPathFor(cwd: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(cwd, ".wanwu", "plans");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${stamp}.plan.md`);
}

function fallbackPlanBody(task: string, cwd: string, state: string): string {
  const memory = discoverMemory(cwd);
  return `# Wanwu Plan

- created: ${new Date().toISOString()}
- workflow_state: ${state}
- memory: ${memory.map((m) => m.kind).join(", ") || "(none)"}
- generated_by: template (no provider credentials)

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
}

/**
 * Write a Plan artifact under .wanwu/plans/.
 * When provider credentials exist, the plan body is LLM-generated;
 * otherwise falls back to the deterministic template.
 */
export async function runPlanAsync(
  task: string,
  cwd: string = findWorkspaceRoot(),
): Promise<string> {
  const wf = new WorkflowMachine();
  wf.send("start_explore");
  wf.send("draft_plan");

  const outPath = planPathFor(cwd);
  const { config } = loadWanwuConfig(cwd);

  let body: string;
  if (hasProviderCredentials(config)) {
    const memory = renderMemoryForPrompt(discoverMemory(cwd));
    const res = await completeChat({
      config,
      request: {
        messages: [
          {
            role: "system",
            content:
              "You are Wanwu Plan. Produce a concise, actionable implementation plan in Chinese markdown. " +
              "Sections: 任务理解 / 涉及文件 / 实施步骤 / 验证方式 / 风险。",
          },
          {
            role: "user",
            content: `${memory ? `${memory}\n\n---\n\n` : ""}Task: ${task}`,
          },
        ],
        temperature: 0.2,
        maxTokens: 2048,
      },
    });
    body = `# Wanwu Plan

- created: ${new Date().toISOString()}
- workflow_state: ${wf.state}
- generated_by: ${res.provider}/${res.model}

${res.text}

## Approval

Reply with \`wanwu\` Agent mode after reviewing this plan, or edit this file first.
`;
  } else {
    body = fallbackPlanBody(task, cwd, wf.state);
  }

  writeFileSync(outPath, body, "utf8");
  if (process.env.WANWU_PLAN_QUIET !== "1") {
    console.log(outPath);
  }
  return outPath;
}

/** Sync template plan (legacy / deterministic callers). */
export function runPlan(task: string, cwd: string = findWorkspaceRoot()): string {
  const wf = new WorkflowMachine();
  wf.send("start_explore");
  wf.send("draft_plan");
  const outPath = planPathFor(cwd);
  writeFileSync(outPath, fallbackPlanBody(task, cwd, wf.state), "utf8");
  if (process.env.WANWU_PLAN_QUIET !== "1") {
    console.log(outPath);
  }
  return outPath;
}
