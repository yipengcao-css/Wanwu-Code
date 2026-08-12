import { mapHttpError, mapNetworkError } from "./errors.js";
import type {
  ChatRequest,
  ChatResponse,
  FetchLike,
  ResolvedProvider,
  StreamChunk,
  ToolCall,
} from "./types.js";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

function toAnthropicMessages(messages: ChatRequest["messages"]): Array<{
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}> {
  const out: Array<{ role: "user" | "assistant"; content: string | AnthropicContentBlock[] }> = [];

  for (const m of messages) {
    if (m.role === "system") continue;

    if (m.role === "tool") {
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

/**
 * Anthropic streaming chat (SSE).
 * Emits text deltas via onChunk; assembles tool_use blocks at the end.
 */
export async function completeAnthropicStream(
  resolved: ResolvedProvider,
  request: ChatRequest,
  fetchImpl: FetchLike = fetch,
  onChunk?: (chunk: StreamChunk) => void,
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
    stream: true,
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

  if (!res.ok) {
    const bodyText = await res.text();
    throw mapHttpError(resolved.id, res.status, bodyText);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw mapNetworkError(resolved.id, new Error("no response body"));
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const toolCalls = new Map<number, { id: string; name: string; inputJson: string }>();
  let currentToolIndex = -1;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = raw.split("\n");
      let event = "";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data = line.slice(5).trim();
      }
      if (!data) continue;

      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        if (event === "content_block_start") {
          const block = parsed.content_block as { type?: string; id?: string; name?: string };
          if (block?.type === "tool_use") {
            currentToolIndex = (parsed.index as number) ?? 0;
            toolCalls.set(currentToolIndex, {
              id: block.id ?? "",
              name: block.name ?? "",
              inputJson: "",
            });
          }
        } else if (event === "content_block_delta") {
          const delta = parsed.delta as
            | { type?: string; text?: string; partial_json?: string }
            | undefined;
          if (delta?.type === "text_delta" && delta.text) {
            text += delta.text;
            onChunk?.({ text: delta.text, done: false });
          } else if (delta?.type === "input_json_delta" && delta.partial_json) {
            const existing = toolCalls.get(currentToolIndex);
            if (existing) existing.inputJson += delta.partial_json;
          }
        } else if (event === "message_stop") {
          onChunk?.({ done: true });
        }
      } catch {
        /* ignore malformed SSE */
      }
    }
  }

  const finalToolCalls: ToolCall[] = [...toolCalls.values()]
    .filter((t) => t.name)
    .map((t) => ({
      id: t.id || `toolu_${t.name}`,
      name: t.name,
      arguments: t.inputJson || "{}",
    }));

  return {
    text: text.trim(),
    provider: resolved.id,
    model,
    toolCalls: finalToolCalls.length ? finalToolCalls : undefined,
  };
}
