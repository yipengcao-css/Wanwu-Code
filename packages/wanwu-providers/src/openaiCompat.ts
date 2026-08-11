import { mapHttpError, mapNetworkError } from "./errors.js";
import type { ChatRequest, ChatResponse, FetchLike, ResolvedProvider } from "./types.js";

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

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 1024,
      }),
    });
  } catch (err) {
    throw mapNetworkError(resolved.id, err);
  }

  const bodyText = await res.text();
  if (!res.ok) {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }

  let data: {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }

  const content = data.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((c) => c.text ?? "").join("")
        : "";

  if (!text.trim()) {
    throw mapHttpError(resolved.id, res.status, bodyText || "empty assistant content");
  }

  return { text: text.trim(), provider: resolved.id, model, raw: data };
}
