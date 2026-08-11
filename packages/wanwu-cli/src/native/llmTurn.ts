import { readFileSync } from "node:fs";
import {
  completeChat,
  hasProviderCredentials,
  ProviderError,
  type ChatMessage,
} from "@wanwu/providers";
import type { ProviderId, WanwuConfig } from "@wanwu/config";
import { discoverMemory } from "../memory.js";
import { sessionUpdate } from "./jsonRpcStdio.js";
import type { AgentContext } from "./agentLoop.js";

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
  const providerId = providerOverride();
  return hasProviderCredentials(config, { providerId });
}

function buildMessages(ctx: AgentContext, prompt: string): ChatMessage[] {
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

  const system = [
    "You are Wanwu, an AI coding agent for the Wanwu-Code IDE.",
    "Be concise. Prefer plain text answers unless asked for code.",
    `Workspace: ${ctx.workspaceRoot}`,
    `Mode: ${ctx.mode}`,
    memory ? `Project memory:\n${memory}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];
}

export async function runLlmTurn(
  ctx: AgentContext,
  config: WanwuConfig,
  prompt: string,
): Promise<{ text: string; provider: string; model: string }> {
  const providerId = providerOverride();
  try {
    const res = await completeChat({
      config,
      providerId,
      request: {
        messages: buildMessages(ctx, prompt),
        temperature: 0.2,
        maxTokens: 1024,
      },
    });
    sessionUpdate(ctx.sessionId, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: res.text },
    });
    return { text: res.text, provider: res.provider, model: res.model };
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
}
