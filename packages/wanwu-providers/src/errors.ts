import type { ProviderId } from "@wanwu/config";
import { ProviderError, type ProviderErrorCode } from "./types.js";

export function mapHttpError(
  provider: ProviderId,
  status: number,
  bodyText: string,
): ProviderError {
  const snippet = bodyText.replace(/\s+/g, " ").slice(0, 240);
  if (status === 401 || status === 403) {
    return new ProviderError({
      code: "auth",
      provider,
      status,
      message: `${provider} auth failed (${status}): ${snippet}`,
      hint: `Check API key env for ${provider} (BYOK). For OpenAI-compatible proxies set providers.${provider}.base_url.`,
    });
  }
  if (status === 429) {
    return new ProviderError({
      code: "rate_limit",
      provider,
      status,
      message: `${provider} rate limited (429): ${snippet}`,
      hint: "Wait and retry, or lower concurrency / switch model.",
    });
  }
  if (status >= 400 && status < 500) {
    return new ProviderError({
      code: "bad_request",
      provider,
      status,
      message: `${provider} bad request (${status}): ${snippet}`,
      hint: "Verify model name and request payload against provider docs.",
    });
  }
  return new ProviderError({
    code: "unknown",
    provider,
    status,
    message: `${provider} HTTP ${status}: ${snippet}`,
    hint: "Retry later; if persistent, inspect provider status page.",
  });
}

export function mapNetworkError(provider: ProviderId, err: unknown): ProviderError {
  const message = err instanceof Error ? err.message : String(err);
  const code: ProviderErrorCode =
    /ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(message) ? "unreachable" : "network";
  const hint =
    provider === "ollama"
      ? "Start Ollama locally (`ollama serve`) or fix providers.ollama.base_url."
      : "Check network / base_url / proxy settings.";
  return new ProviderError({
    code,
    provider,
    message: `${provider} network error: ${message}`,
    hint,
  });
}
