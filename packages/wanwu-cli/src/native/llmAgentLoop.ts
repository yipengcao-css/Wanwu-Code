import {
  completeChat,
  hasProviderCredentials,
  ProviderError,
  streamChat,
  type ChatMessage,
  type ChatResponse,
  type FetchLike,
  type Usage,
} from "@wanwu/providers";
import type { ProviderId, WanwuConfig } from "@wanwu/config";
import { runHooks } from "../hooks.js";
import { ensureMcpRegistry, peekMcpRegistry } from "../mcp/registry.js";
import { compactMessages } from "./context/compact.js";
import { newTurnId, pruneCheckpoints } from "./checkpoints.js";
import { runDiagnose } from "./diagnose.js";
import { expandMentions, type MentionHostProviders } from "./mentions.js";
import { sessionUpdate } from "./jsonRpcStdio.js";
import { toolWebSearch } from "./web.js";
import type { AgentContext } from "./agentLoop.js";
import { detectMode } from "./mode.js";
import { dispatchTool } from "./toolDispatch.js";
import { shouldStream } from "./stream.js";
import { WANWU_TOOL_SPECS } from "./toolSpecs.js";
import { maybeAutoRemember } from "./autoMemory.js";
import { buildSystem, parseEditorContext } from "./agentPrompt.js";
import { toolsForMode } from "./modeTools.js";
import { canRunToolsInParallel } from "./parallelTools.js";

function providerOverride(): ProviderId | undefined {
  const raw = process.env.WANWU_PROVIDER?.trim();
  if (!raw) return undefined;
  if (["xai", "openai", "anthropic", "ollama", "custom"].includes(raw)) {
    return raw as ProviderId;
  }
  return undefined;
}

export function shouldUseLlm(config: WanwuConfig): boolean {
  if (process.env.WANWU_FORCE_DETERMINISTIC === "1") return false;
  return hasProviderCredentials(config, { providerId: providerOverride() });
}

export interface LlmLoopResult {
  text: string;
  provider: string;
  model: string;
  turns: number;
  toolsUsed: string[];
  /** Summed token usage across turns (when providers report it). */
  usage?: Usage;
  /** Checkpoint id for this turn (restore via `wanwu undo`). */
  checkpointId?: string;
  /** Full chat transcript for cross-prompt session memory (includes system). */
  messages: ChatMessage[];
}

const MAX_HISTORY_MESSAGES = 96;

function contextBudget(): number {
  return Number(process.env.WANWU_CONTEXT_TOKENS ?? "120000") || 120_000;
}

function maxOutputTokens(): number {
  return Number(process.env.WANWU_MAX_OUTPUT_TOKENS ?? "8192") || 8192;
}

/**
 * Multi-turn tool-calling agent loop (OpenAI-compat providers).
 * Pass `history` (prior session messages, system stripped) to continue a conversation.
 */
export async function runLlmAgentLoop(
  ctx: AgentContext,
  config: WanwuConfig,
  prompt: string,
  opts?: {
    fetchImpl?: FetchLike;
    maxTurns?: number;
    history?: ChatMessage[];
    signal?: AbortSignal;
    /** Stream assistant text deltas to ACP session updates. */
    stream?: boolean;
    /** Multimodal attachments for the user prompt. */
    attachments?: import("@wanwu/providers").ContentPart[];
    /** Host-provided context for @terminal / @diagnostics / @web mentions. */
    hostContext?: MentionHostProviders;
    /** Persist WANWU.md when the user explicitly asked to remember (default on). */
    autoMemory?: boolean;
  },
): Promise<LlmLoopResult> {
  const mode = detectMode(prompt, ctx.mode);
  const maxTurns = opts?.maxTurns ?? (Number(process.env.WANWU_AGENT_MAX_TURNS ?? "25") || 25);
  const providerId = providerOverride();
  const toolsUsed: string[] = [];
  // One checkpoint per prompt turn; Edit/Write back up before-state into it.
  const turnId = newTurnId(ctx.sessionId);
  ctx.turnId = turnId;
  pruneCheckpoints(ctx.workspaceRoot);
  const callEnv = {
    ...process.env,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "sk-fixture",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "sk-fixture",
    XAI_API_KEY: process.env.XAI_API_KEY ?? "sk-fixture",
  };

  const summarize = async (text: string): Promise<string> => {
    const r = await completeChat({
      config,
      providerId,
      fetchImpl: opts?.fetchImpl,
      env: callEnv,
      request: {
        messages: [
          {
            role: "user",
            content:
              "Summarize this earlier agent conversation for continuity. Keep: user goals, decisions made, files changed, tool outcomes that matter, pending tasks. Be terse (<= 400 words).\n\n" +
              text,
          },
        ],
        temperature: 0.1,
        maxTokens: 1200,
      },
    });
    return r.text;
  };

  await ensureMcpRegistry(ctx.workspaceRoot);
  const tools = toolsForMode(mode, [
    ...WANWU_TOOL_SPECS,
    ...(peekMcpRegistry(ctx.workspaceRoot)?.listToolSpecs() ?? []),
  ]);

  const prior = (opts?.history ?? [])
    .filter((m) => m.role !== "system")
    .slice(-MAX_HISTORY_MESSAGES);

  const expanded = await expandMentions(ctx.workspaceRoot, prompt, {
    webSearch: async (q) => (await toolWebSearch(q)).text,
    codebaseSearch: async (q) => {
      const { searchCodebase, formatSearchHits } = await import("./codebaseIndex/search.js");
      const r = await searchCodebase(ctx.workspaceRoot, q, { config, limit: 8 });
      return `[index ${r.stats}]\n${formatSearchHits(r.hits)}`;
    },
    ...opts?.hostContext,
  });
  const finalPrompt = expanded.context ? `${expanded.text}\n\n${expanded.context}` : prompt;
  const editor = parseEditorContext(finalPrompt);
  const activeFiles = [
    ...expanded.mentions.filter((m) => m.kind === "file").map((m) => m.arg),
    ...editor.openTabs,
  ];

  const userContent =
    opts?.attachments?.length
      ? [{ type: "text" as const, text: finalPrompt }, ...opts.attachments]
      : finalPrompt;

  let messages: ChatMessage[] = [
    { role: "system", content: buildSystem(ctx, mode, activeFiles, editor, finalPrompt) },
    ...prior,
    { role: "user", content: userContent },
  ];

  let last: ChatResponse | undefined;
  let turns = 0;
  let usage: Usage | undefined;
  let appliedEdits: string[] = [];
  let lintLoopRemaining =
    process.env.WANWU_LINT_LOOP === "0"
      ? 0
      : Number(process.env.WANWU_LINT_LOOP_MAX ?? "2") || 2;

  for (let i = 0; i < maxTurns; i += 1) {
    if (opts?.signal?.aborted) {
      throw new Error("aborted");
    }
    turns = i + 1;

    const compacted = await compactMessages(messages, {
      budgetTokens: contextBudget(),
      summarize,
    });
    if (compacted.compacted) {
      messages = compacted.messages;
      sessionUpdate(ctx.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: `\n🗜 上下文压缩：折叠 ${compacted.droppedCount} 条早期消息（~${compacted.droppedTokens} tokens）\n`,
        },
      });
    }

    try {
      const useStream = shouldStream(opts);
      if (useStream) {
        last = await streamChat({
          config,
          providerId,
          fetchImpl: opts?.fetchImpl,
          env: callEnv,
          request: {
            messages,
            temperature: 0.2,
            maxTokens: maxOutputTokens(),
            tools,
            toolChoice: "auto",
          },
          onChunk: (chunk) => {
            if (chunk.thought) {
              sessionUpdate(ctx.sessionId, {
                sessionUpdate: "agent_thought_chunk",
                content: { type: "text", text: chunk.thought },
              });
            }
            if (chunk.text) {
              sessionUpdate(ctx.sessionId, {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: chunk.text },
              });
            }
          },
        });
      } else {
        last = await completeChat({
          config,
          providerId,
          fetchImpl: opts?.fetchImpl,
          env: callEnv,
          request: {
            messages,
            temperature: 0.2,
            maxTokens: maxOutputTokens(),
            tools,
            toolChoice: "auto",
          },
        });
      }
    } catch (err) {
      runHooks(ctx.workspaceRoot, "Error", {
        sessionId: ctx.sessionId,
        errorMessage: err instanceof Error ? err.message : String(err),
        errorSource: "llm-loop",
      });
      if (err instanceof ProviderError) {
        const text = `Provider error (${err.provider}/${err.code}): ${err.message}\nHint: ${err.hint}`;
        sessionUpdate(ctx.sessionId, {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text },
        });
        throw err;
      }
      throw err;
    }

    if (last?.usage) {
      usage = {
        inputTokens: (usage?.inputTokens ?? 0) + last.usage.inputTokens,
        outputTokens: (usage?.outputTokens ?? 0) + last.usage.outputTokens,
        totalTokens: (usage?.totalTokens ?? 0) + last.usage.totalTokens,
      };
    }

    if (last.toolCalls?.length) {
      messages.push({
        role: "assistant",
        content: last.text || "",
        toolCalls: last.toolCalls,
      });
      const planned = last.toolCalls.map((call) => {
        toolsUsed.push(call.name);
        const toolCallId = `native-tool-${toolsUsed.length}`;
        sessionUpdate(ctx.sessionId, {
          sessionUpdate: "tool_call",
          toolCallId,
          title: call.name,
          status: "pending",
          content: { type: "text", text: call.arguments.slice(0, 500) },
        });
        return { call, toolCallId };
      });

      const runOne = async (item: (typeof planned)[number]) => {
        if (opts?.signal?.aborted) {
          throw new Error("aborted");
        }
        const result = await dispatchTool(ctx, mode, item.call.name, item.call.arguments);
        const isProposal =
          (item.call.name === "Edit" || item.call.name === "Write") &&
          result.ok &&
          Boolean(result.diff) &&
          result.applied === false;
        sessionUpdate(ctx.sessionId, {
          sessionUpdate: "tool_call",
          toolCallId: item.toolCallId,
          title: item.call.name,
          status: result.ok ? (isProposal ? "pending" : "completed") : "failed",
          content: {
            type: result.diff ? "diff" : "text",
            text: result.text.slice(0, 8000),
            path: result.diff?.path,
            before: result.diff?.before,
            after: result.diff?.after,
          },
        });
        return { call: item.call, result };
      };

      const executed = canRunToolsInParallel(planned.map((p) => p.call.name))
        ? await Promise.all(planned.map(runOne))
        : await (async () => {
            const out: Awaited<ReturnType<typeof runOne>>[] = [];
            for (const item of planned) out.push(await runOne(item));
            return out;
          })();

      for (const { call, result } of executed) {
        if (
          (call.name === "Edit" || call.name === "Write") &&
          result.ok &&
          result.applied === true &&
          result.diff
        ) {
          appliedEdits.push(result.diff.path);
        }
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: result.text.slice(0, 12000),
        });
      }
      continue;
    }

    // Lint loop: after applied edits, re-check diagnostics and let the agent
    // fix fresh errors before ending the turn (Cursor-style iterate-on-lints).
    if (appliedEdits.length && lintLoopRemaining > 0) {
      const diag = runDiagnose(ctx.workspaceRoot);
      if (diag.available && !diag.ok) {
        lintLoopRemaining -= 1;
        const files = [...new Set(appliedEdits)].join(", ");
        appliedEdits = [];
        sessionUpdate(ctx.sessionId, {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: `\n⚠ 诊断发现错误（${diag.label}），自动继续修复…\n`,
          },
        });
        if (last.text) {
          messages.push({ role: "assistant", content: last.text });
        }
        messages.push({
          role: "user",
          content: `Diagnostics after editing ${files} (${diag.label}):\n${diag.output}\n\nFix these errors, then re-run Diagnose to confirm.`,
        });
        continue;
      }
    }

    if (last.text && !shouldStream(opts)) {
      sessionUpdate(ctx.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: last.text },
      });
    }
    break;
  }

  if (turns >= maxTurns && last?.toolCalls?.length) {
    const notice = `\n\n[回合上限 ${maxTurns} 已到。已完成的步骤见上方；再说一次即可继续。可用检查点 ${turnId} 撤销本轮文件改动。]`;
    last = { ...last, text: `${last.text ?? ""}${notice}` };
    sessionUpdate(ctx.sessionId, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: notice },
    });
  }

  if (opts?.autoMemory !== false && !opts?.fetchImpl) {
    const note = maybeAutoRemember(ctx.workspaceRoot, prompt, last?.text ?? "");
    if (note) {
      sessionUpdate(ctx.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `\n已自动写入 WANWU.md：${note}\n` },
      });
    }
  }

  return {
    text: last?.text ?? "",
    provider: last?.provider ?? config.activeProvider,
    model: last?.model ?? config.model,
    turns,
    toolsUsed,
    usage,
    checkpointId: turnId,
    messages,
  };
}

/** @deprecated use runLlmAgentLoop */
export async function runLlmTurn(
  ctx: AgentContext,
  config: WanwuConfig,
  prompt: string,
): Promise<{ text: string; provider: string; model: string }> {
  const r = await runLlmAgentLoop(ctx, config, prompt);
  return { text: r.text, provider: r.provider, model: r.model };
}
