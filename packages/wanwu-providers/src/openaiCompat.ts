import { mapHttpError, mapNetworkError } from "./errors.js";
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  FetchLike,
  ResolvedProvider,
  ToolCall,
} from "./types.js";

function toApiMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.toolCallId,
        content: typeof m.content === "string" ? m.content : m.content,
      };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: typeof m.content === "string" ? m.content || null : m.content,
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: "function",
          function: { name: t.name, arguments: t.arguments },
        })),
      };
    }
    if (Array.isArray(m.content)) {
      return {
        role: m.role,
        content: m.content.map((p) => {
          if (p.type === "text") return { type: "text", text: p.text };
          if (p.type === "image" && p.source.kind === "base64") {
            return {
              type: "image_url",
              image_url: {
                url: `data:${p.source.mediaType};base64,${p.source.data}`,
              },
            };
          }
          if (p.type === "image" && p.source.kind === "url") {
            return { type: "image_url", image_url: { url: p.source.url } };
          }
          return { type: "text", text: "" };
        }),
      };
    }
    return { role: m.role, content: m.content };
  });
}

export async function completeOpenAiCompat(
  resolved: ResolvedProvider,
  request: ChatRequest,
  fetchImpl: FetchLike = fetch,
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

  const bodyText = await res.text();
  if (!res.ok) {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }

  let data: {
    choices?: Array<{
      message?: {
        content?: string | Array<{ text?: string }> | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }

  const message = data.choices?.[0]?.message;
  const content = message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((c) => c.text ?? "").join("")
        : "";

  const toolCalls: ToolCall[] = (message?.tool_calls ?? [])
    .map((tc, i) => ({
      id: tc.id ?? `call_${i}`,
      name: tc.function?.name ?? "",
      arguments: tc.function?.arguments ?? "{}",
    }))
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
