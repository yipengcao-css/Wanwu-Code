import { completeAnthropic } from "./anthropic.js";
import { completeOpenAiCompat } from "./openaiCompat.js";
import { resolveProvider } from "./resolve.js";
import type { ChatResponse, CompleteChatOptions } from "./types.js";

export async function completeChat(opts: CompleteChatOptions): Promise<ChatResponse> {
  const resolved = resolveProvider(opts.config, {
    providerId: opts.providerId,
    env: opts.env,
  });
  const fetchImpl = opts.fetchImpl ?? fetch;
  const request = {
    ...opts.request,
    model: opts.request.model ?? resolved.model,
  };

  if (resolved.kind === "anthropic") {
    return completeAnthropic(resolved, request, fetchImpl);
  }
  return completeOpenAiCompat(resolved, request, fetchImpl);
}
