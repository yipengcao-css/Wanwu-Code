import type { ChatMessage } from "@wanwu/providers";
import { runLlmAgentLoop } from "../llmAgentLoop.js";
import { runPlanAsync } from "../../plan.js";
import { emitSubagentComplete, emitSubagentStart } from "./emit.js";
import { policyFor } from "./policy.js";
import type { SubagentResult, SubagentRunOptions, SubagentSpec } from "./types.js";
import { createSubagentWorktree } from "./worktree.js";

let counter = 0;

export async function runSubagent(
  spec: SubagentSpec,
  opts: SubagentRunOptions,
): Promise<SubagentResult> {
  const id = `sub-${++counter}`;
  const name = spec.name ?? spec.kind;
  const policy = policyFor(spec.kind);

  emitSubagentStart(opts.parentSessionId, id, spec.kind, name, spec.prompt);

  // coder gets an isolated worktree; explore/plan stay in the main workspace
  const useWorktree = spec.kind === "coder";
  const wt = useWorktree ? createSubagentWorktree(opts.workspaceRoot, id) : undefined;
  const effectiveRoot = wt?.path ?? opts.workspaceRoot;

  const ctx = {
    workspaceRoot: effectiveRoot,
    sessionId: `${opts.parentSessionId}:${id}`,
    permissionMode: opts.permissionMode,
    mode: policy.mode,
  };

  try {
    if (spec.kind === "plan") {
      const planPath = await runPlanAsync(spec.prompt, opts.workspaceRoot);
      const summary = `Plan written: ${planPath}`;
      emitSubagentComplete(opts.parentSessionId, id, spec.kind, name, summary, true);
      return {
        id,
        kind: spec.kind,
        name,
        ok: true,
        summary,
        toolsUsed: ["Plan"],
        history: [],
      };
    }

    const out = await runLlmAgentLoop(ctx, opts.config, spec.prompt, {
      maxTurns: policy.maxTurns,
      fetchImpl: opts.fetchImpl,
      history: [],
    });

    const summary = out.text || "(no text output)";
    emitSubagentComplete(opts.parentSessionId, id, spec.kind, name, summary, true);
    return {
      id,
      kind: spec.kind,
      name,
      ok: true,
      summary,
      toolsUsed: out.toolsUsed,
      history: out.messages.filter((m) => m.role !== "system"),
      worktree: wt?.path,
      branch: wt?.branch,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitSubagentComplete(opts.parentSessionId, id, spec.kind, name, msg, false);
    return {
      id,
      kind: spec.kind,
      name,
      ok: false,
      summary: msg,
      toolsUsed: [],
      history: [] as ChatMessage[],
      error: msg,
      worktree: wt?.path,
      branch: wt?.branch,
    };
  } finally {
    // Keep worktree for review; cleanup is explicit via parent/CLI.
  }
}
