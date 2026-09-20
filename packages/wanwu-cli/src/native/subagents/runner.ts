import type { ChatMessage } from "@wanwu/providers";
import { runLlmAgentLoop } from "../llmAgentLoop.js";
import { runPlanAsync } from "../../plan.js";
import { runHooks } from "../../hooks.js";
import { emitSubagentComplete, emitSubagentStart } from "./emit.js";
import { isBashAllowedForKind, isToolAllowed, policyFor } from "./policy.js";
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
  runHooks(opts.workspaceRoot, "SubagentStart", {
    sessionId: opts.parentSessionId,
    subagentId: id,
    subagentKind: spec.kind,
    subagentName: name,
  });

  // coder gets an isolated worktree; explore/plan stay in the main workspace
  const useWorktree = spec.kind === "coder";
  const wt = useWorktree ? createSubagentWorktree(opts.workspaceRoot, id) : undefined;
  // Fail closed when isolation was requested but unavailable (branch === ""
  // means git worktree creation failed and we fell back to the main checkout).
  if (useWorktree && wt && wt.branch === "" && process.env.WANWU_SUBAGENT_NO_WORKTREE !== "1") {
    const msg =
      "coder subagent requires git worktree isolation; creation failed. " +
      "Set WANWU_SUBAGENT_NO_WORKTREE=1 to allow running in the main checkout.";
    emitSubagentComplete(opts.parentSessionId, id, spec.kind, name, msg, false);
    runHooks(opts.workspaceRoot, "SubagentEnd", {
      sessionId: opts.parentSessionId,
      subagentId: id,
      subagentKind: spec.kind,
      subagentName: name,
      subagentOk: false,
    });
    return {
      id,
      kind: spec.kind,
      name,
      ok: false,
      summary: msg,
      toolsUsed: [],
      history: [],
      error: msg,
    };
  }
  const effectiveRoot = wt?.path ?? opts.workspaceRoot;

  const ctx = {
    workspaceRoot: effectiveRoot,
    sessionId: `${opts.parentSessionId}:${id}`,
    permissionMode: opts.permissionMode,
    mode: policy.mode,
    // Enforce the kind's tool allow-list at dispatch time.
    toolGuard: (toolName: string, argsJson: string): string | undefined => {
      if (!isToolAllowed(spec.kind, toolName)) {
        return `tool ${toolName} not allowed for ${spec.kind} subagent`;
      }
      if (toolName === "Bash") {
        try {
          const cmd = String((JSON.parse(argsJson) as { command?: unknown }).command ?? "");
          if (!isBashAllowedForKind(spec.kind, cmd)) {
            return `Bash not allowed for ${spec.kind} subagent (read-only commands only): ${cmd.slice(0, 80)}`;
          }
        } catch {
          return `invalid Bash args for ${spec.kind} subagent`;
        }
      }
      return undefined;
    },
  };

  try {
    if (spec.kind === "plan") {
      const planPath = await runPlanAsync(spec.prompt, opts.workspaceRoot);
      const summary = `Plan written: ${planPath}`;
      emitSubagentComplete(opts.parentSessionId, id, spec.kind, name, summary, true);
      runHooks(opts.workspaceRoot, "SubagentEnd", {
        sessionId: opts.parentSessionId,
        subagentId: id,
        subagentKind: spec.kind,
        subagentName: name,
        subagentOk: true,
      });
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
      // Fixture fetchImpls return JSON, not SSE — keep them on the complete path.
      stream: opts.fetchImpl ? false : undefined,
    });

    const summary = out.text || "(no text output)";
    emitSubagentComplete(opts.parentSessionId, id, spec.kind, name, summary, true);
    runHooks(opts.workspaceRoot, "SubagentEnd", {
      sessionId: opts.parentSessionId,
      subagentId: id,
      subagentKind: spec.kind,
      subagentName: name,
      subagentOk: true,
    });
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
    runHooks(opts.workspaceRoot, "SubagentEnd", {
      sessionId: opts.parentSessionId,
      subagentId: id,
      subagentKind: spec.kind,
      subagentName: name,
      subagentOk: false,
    });
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
