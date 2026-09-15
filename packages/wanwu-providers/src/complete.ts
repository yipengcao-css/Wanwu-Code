import { completeAnthropic } from "./anthropic.js";
import { completeAnthropicStream } from "./anthropicStream.js";
import { assertMediaSupported } from "./capabilities.js";
import { completeOpenAiCompat } from "./openaiCompat.js";
import { completeOpenAiCompatStream } from "./openaiCompatStream.js";
import type { ContentPart } from "./content.js";
import { resolveProvider } from "./resolve.js";
import type {
  ChatMessage,
  ChatResponse,
  CompleteChatOptions,
  StreamChatOptions,
} from "./types.js";

function collectParts(messages: ChatMessage[]): ContentPart[] {
  const parts: ContentPart[] = [];
  for (const m of messages) {
    if (Array.isArray(m.content)) parts.push(...m.content);
  }
  return parts;
}

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
  assertMediaSupported(resolved.id, collectParts(request.messages), request.model);

  if (resolved.kind === "anthropic") {
    return completeAnthropic(resolved, request, fetchImpl);
  }
  return completeOpenAiCompat(resolved, request, fetchImpl);
}

export async function streamChat(opts: StreamChatOptions): Promise<ChatResponse> {
  const resolved = resolveProvider(opts.config, {
    providerId: opts.providerId,
    env: opts.env,
  });
  const fetchImpl = opts.fetchImpl ?? fetch;
  const request = {
    ...opts.request,
    model: opts.request.model ?? resolved.model,
    stream: true,
  };
  assertMediaSupported(resolved.id, collectParts(request.messages), request.model);

  if (resolved.kind === "anthropic") {
    return completeAnthropicStream(resolved, request, fetchImpl, opts.onChunk);
  }
  return completeOpenAiCompatStream(resolved, request, fetchImpl, opts.onChunk);
}
