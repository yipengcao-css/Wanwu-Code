import { mapHttpError, mapNetworkError } from "./errors.js";
import type { ChatRequest, ChatResponse, FetchLike, ResolvedProvider } from "./types.js";

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
  const messages = request.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": resolved.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.2,
        system: system || undefined,
        messages,
      }),
    });
  } catch (err) {
    throw mapNetworkError(resolved.id, err);
  }

  const bodyText = await res.text();
  if (!res.ok) {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }

  let data: { content?: Array<{ type?: string; text?: string }> };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }

  const text = (data.content ?? [])
    .filter((c) => c.type === "text" || typeof c.text === "string")
    .map((c) => c.text ?? "")
    .join("");

  if (!text.trim()) {
    throw mapHttpError(resolved.id, res.status, bodyText || "empty assistant content");
  }

  return { text: text.trim(), provider: resolved.id, model, raw: data };
}
