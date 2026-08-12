import { mapHttpError, mapNetworkError } from "./errors.js";
import type {
  ChatRequest,
  ChatResponse,
  FetchLike,
  ResolvedProvider,
  StreamChunk,
  ToolCall,
} from "./types.js";

function toApiMessages(messages: ChatRequest["messages"]): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content,
      };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: "function",
          function: { name: t.name, arguments: t.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

/**
 * OpenAI-compat streaming chat (SSE).
 * Emits text deltas via onChunk; assembles tool_calls at the end.
 */
export async function completeOpenAiCompatStream(
  resolved: ResolvedProvider,
  request: ChatRequest,
  fetchImpl: FetchLike = fetch,
  onChunk?: (chunk: StreamChunk) => void,
): Promise<ChatResponse> {
  const model = request.model ?? resolved.model;
  const url = `${resolved.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (resolved.apiKey) {
    headers.authorization = `Bearer ${resolved.apiKey}`;
  }

  const body: Record<string, unknown> = {
    model,
    messages: toApiMessages(request.messages),
    temperature: request.temperature ?? 0.2,
    max_tokens: request.maxTokens ?? 2048,
    stream: true,
  };

  if (request.tools?.length) {
    body.tools = request.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    body.tool_choice = request.toolChoice ?? "auto";
  }

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
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
  const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        onChunk?.({ done: true });
        continue;
      }
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string;
          }>;
        };
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) {
          text += delta.content;
          onChunk?.({ text: delta.content, done: false });
        }
        for (const tc of delta?.tool_calls ?? []) {
          const i = tc.index ?? 0;
          const existing = toolCalls.get(i) ?? { id: "", name: "", arguments: "" };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          toolCalls.set(i, existing);
        }
      } catch {
        /* ignore malformed SSE line */
      }
    }
  }

  const finalToolCalls: ToolCall[] = [...toolCalls.values()]
    .filter((t) => t.name)
    .map((t) => ({ id: t.id || `call_${t.name}`, name: t.name, arguments: t.arguments }));

  return {
    text: text.trim(),
    provider: resolved.id,
    model,
    toolCalls: finalToolCalls.length ? finalToolCalls : undefined,
  };
}
