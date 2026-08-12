import { mapHttpError, mapNetworkError } from "./errors.js";
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  FetchLike,
  ResolvedProvider,
  ToolCall,
} from "./types.js";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

function toAnthropicMessages(messages: ChatMessage[]): Array<{
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}> {
  const out: Array<{ role: "user" | "assistant"; content: string | AnthropicContentBlock[] }> = [];

  for (const m of messages) {
    if (m.role === "system") continue;

    if (m.role === "tool") {
      // Anthropic expects tool_result inside a user message.
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId ?? "",
            content: typeof m.content === "string" ? m.content : "",
          },
        ],
      });
      continue;
    }

    if (m.role === "assistant" && m.toolCalls?.length) {
      const blocks: AnthropicContentBlock[] = [];
      const text = typeof m.content === "string" ? m.content : "";
      if (text.trim()) {
        blocks.push({ type: "text", text });
      }
      for (const tc of m.toolCalls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.arguments || "{}") as Record<string, unknown>;
        } catch {
          input = {};
        }
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input,
        });
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    if (Array.isArray(m.content)) {
      const blocks: AnthropicContentBlock[] = [];
      for (const p of m.content) {
        if (p.type === "text") {
          blocks.push({ type: "text", text: p.text });
        } else if (p.type === "image" && p.source.kind === "base64") {
          blocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: p.source.mediaType,
              data: p.source.data,
            },
          });
        }
      }
      out.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: blocks,
      });
      continue;
    }

    out.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    });
  }

  // Anthropic requires alternating user/assistant; merge consecutive same-role messages.
  const merged: typeof out = [];
  for (const msg of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === msg.role) {
      const prevBlocks = Array.isArray(prev.content)
        ? prev.content
        : [{ type: "text" as const, text: prev.content }];
      const msgBlocks = Array.isArray(msg.content)
        ? msg.content
        : [{ type: "text" as const, text: msg.content }];
      prev.content = [...prevBlocks, ...msgBlocks];
    } else {
      merged.push(msg);
    }
  }
  return merged;
}

export async function completeAnthropic(
  resolved: ResolvedProvider,
  request: ChatRequest,
  fetchImpl: FetchLike = fetch,
): Promise<ChatResponse> {
  const model = request.model ?? resolved.model;
  const url = `${resolved.baseUrl.replace(/\/$/, "")}/v1/messages`;
  const system = request.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const body: Record<string, unknown> = {
    model,
    max_tokens: request.maxTokens ?? 2048,
    temperature: request.temperature ?? 0.2,
    system: system || undefined,
    messages: toAnthropicMessages(request.messages),
  };

  if (request.tools?.length) {
    body.tools = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
    body.tool_choice = request.toolChoice === "none" ? { type: "none" } : { type: "auto" };
  }

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": resolved.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw mapNetworkError(resolved.id, err);
  }

  const bodyText = await res.text();
  if (!res.ok) {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }

  let data: {
    content?: Array<
      | { type?: "text"; text?: string }
      | { type?: "tool_use"; id?: string; name?: string; input?: Record<string, unknown> }
    >;
    stop_reason?: string;
  };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }

  const text = (data.content ?? [])
    .filter((c) => c.type === "text" || typeof (c as { text?: string }).text === "string")
    .map((c) => (c as { text?: string }).text ?? "")
    .join("");

  const toolCalls: ToolCall[] = (data.content ?? [])
    .filter((c) => c.type === "tool_use")
    .map((c, i) => {
      const tu = c as { id?: string; name?: string; input?: Record<string, unknown> };
      return {
        id: tu.id ?? `toolu_${i}`,
        name: tu.name ?? "",
        arguments: JSON.stringify(tu.input ?? {}),
      };
    })
    .filter((t) => t.name);

  if (!text.trim() && toolCalls.length === 0) {
    throw mapHttpError(resolved.id, res.status, bodyText || "empty assistant content");
  }

  return {
    text: text.trim(),
    provider: resolved.id,
    model,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    raw: data,
  };
}
