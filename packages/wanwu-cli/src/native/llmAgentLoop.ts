import { readFileSync } from "node:fs";
import {
  completeChat,
  hasProviderCredentials,
  ProviderError,
  streamChat,
  type ChatMessage,
  type ChatResponse,
  type FetchLike,
} from "@wanwu/providers";
import type { ProviderId, WanwuConfig, WanwuMode } from "@wanwu/config";
import { discoverMemory } from "../memory.js";
import { ensureMcpRegistry, peekMcpRegistry } from "../mcp/registry.js";
import { discoverSkills, renderSkillsForPrompt } from "../skills.js";
import { sessionUpdate } from "./jsonRpcStdio.js";
import type { AgentContext } from "./agentLoop.js";
import { detectMode } from "./mode.js";
import { dispatchTool } from "./toolDispatch.js";
import { WANWU_TOOL_SPECS } from "./toolSpecs.js";

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

function buildSystem(ctx: AgentContext, mode: WanwuMode): string {
  const memory = discoverMemory(ctx.workspaceRoot)
    .slice(0, 2)
    .map((f) => {
      try {
        return readFileSync(f.path, "utf8").slice(0, 1200);
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n---\n");

  const mcpNames = peekMcpRegistry(ctx.workspaceRoot)
    ?.listTools()
    .map((t) => t.qualifiedName)
    .slice(0, 40);
  const skills = renderSkillsForPrompt(discoverSkills(ctx.workspaceRoot));

  return [
    "You are Wanwu, an AI coding agent. Use tools when you need workspace facts.",
    "Prefer Read/Glob/Grep before answering about files. Be concise.",
    `Workspace: ${ctx.workspaceRoot}`,
    `Mode: ${mode}`,
    mode === "plan" || mode === "ask"
      ? "Do NOT use Edit. Avoid destructive Bash."
      : "You may Edit/Bash when needed (permissions still apply).",
    mcpNames?.length
      ? `MCP tools available (namespaced mcp__server__tool): ${mcpNames.join(", ")}`
      : "",
    skills ? `Project skills:\n${skills}` : "",
    memory ? `Project memory:\n${memory}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface LlmLoopResult {
  text: string;
  provider: string;
  model: string;
  turns: number;
  toolsUsed: string[];
  /** Full chat transcript for cross-prompt session memory (includes system). */
  messages: ChatMessage[];
}

const MAX_HISTORY_MESSAGES = 48;

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
  },
): Promise<LlmLoopResult> {
  const mode = detectMode(prompt, ctx.mode);
  const maxTurns = opts?.maxTurns ?? (Number(process.env.WANWU_AGENT_MAX_TURNS ?? "6") || 6);
  const providerId = providerOverride();
  const toolsUsed: string[] = [];

  await ensureMcpRegistry(ctx.workspaceRoot);
  const tools = [
    ...WANWU_TOOL_SPECS,
    ...(peekMcpRegistry(ctx.workspaceRoot)?.listToolSpecs() ?? []),
  ];

  const prior = (opts?.history ?? [])
    .filter((m) => m.role !== "system")
    .slice(-MAX_HISTORY_MESSAGES);

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystem(ctx, mode) },
    ...prior,
    { role: "user", content: prompt },
  ];

  let last: ChatResponse | undefined;
  let turns = 0;

  for (let i = 0; i < maxTurns; i += 1) {
    if (opts?.signal?.aborted) {
      throw new Error("aborted");
    }
    turns = i + 1;
    try {
      const useStream = opts?.stream ?? process.env.WANWU_STREAM === "1";
      if (useStream) {
        last = await streamChat({
          config,
          providerId,
          fetchImpl: opts?.fetchImpl,
          env: {
            ...process.env,
            OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "sk-fixture",
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "sk-fixture",
            XAI_API_KEY: process.env.XAI_API_KEY ?? "sk-fixture",
          },
          request: {
            messages,
            temperature: 0.2,
            maxTokens: 2048,
            tools,
            toolChoice: "auto",
          },
          onChunk: (chunk) => {
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
          env: {
            ...process.env,
            // fixture / injected fetch paths still need resolveProvider credentials
            OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "sk-fixture",
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "sk-fixture",
            XAI_API_KEY: process.env.XAI_API_KEY ?? "sk-fixture",
          },
          request: {
            messages,
            temperature: 0.2,
            maxTokens: 2048,
            tools,
            toolChoice: "auto",
          },
        });
      }
    } catch (err) {
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

    if (last.toolCalls?.length) {
      messages.push({
        role: "assistant",
        content: last.text || "",
        toolCalls: last.toolCalls,
      });
      for (const call of last.toolCalls) {
        toolsUsed.push(call.name);
        const toolCallId = `native-tool-${toolsUsed.length}`;
        sessionUpdate(ctx.sessionId, {
          sessionUpdate: "tool_call",
          toolCallId,
          title: call.name,
          status: "pending",
          content: { type: "text", text: call.arguments.slice(0, 500) },
        });
        if (opts?.signal?.aborted) {
          throw new Error("aborted");
        }
        const result = await dispatchTool(ctx, mode, call.name, call.arguments);
        const isProposal = call.name === "Edit" && result.ok && Boolean(result.diff);
        sessionUpdate(ctx.sessionId, {
          sessionUpdate: "tool_call",
          toolCallId,
          title: call.name,
          status: result.ok ? (isProposal ? "pending" : "completed") : "failed",
          content: {
            type: result.diff ? "diff" : "text",
            text: result.text.slice(0, 8000),
            path: result.diff?.path,
            before: result.diff?.before,
            after: result.diff?.after,
          },
        });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: result.text.slice(0, 12000),
        });
      }
      continue;
    }

    if (last.text && !(opts?.stream ?? process.env.WANWU_STREAM === "1")) {
      sessionUpdate(ctx.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: last.text },
      });
    }
    break;
  }

  return {
    text: last?.text ?? "",
    provider: last?.provider ?? config.activeProvider,
    model: last?.model ?? config.model,
    turns,
    toolsUsed,
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
