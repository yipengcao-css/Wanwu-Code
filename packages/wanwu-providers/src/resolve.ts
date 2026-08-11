import type { ProviderId, WanwuConfig } from "@wanwu/config";
import { ProviderError, type ResolvedProvider } from "./types.js";

const DEFAULT_BASE: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  anthropic: "https://api.anthropic.com",
  ollama: "http://127.0.0.1:11434/v1",
  custom: "",
};

function normalizeOpenAiBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (!trimmed) return trimmed;
  if (/\/v\d+$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

export function resolveProvider(
  config: WanwuConfig,
  opts?: { providerId?: ProviderId; env?: NodeJS.ProcessEnv },
): ResolvedProvider {
  const env = opts?.env ?? process.env;
  const id = opts?.providerId ?? config.activeProvider;
  const pc = config.providers[id] ?? {};

  const model =
    env.WANWU_MODEL?.trim() ||
    (opts?.providerId && opts.providerId !== config.activeProvider
      ? pc.defaultModel
      : undefined) ||
    config.model ||
    pc.defaultModel ||
    "unknown";

  const envBase =
    env.WANWU_PROVIDER_BASE_URL?.trim() ||
    (id === "openai" ? env.OPENAI_BASE_URL?.trim() : undefined) ||
    (id === "custom" ? env.WANWU_CUSTOM_BASE_URL?.trim() : undefined) ||
    (id === "ollama" ? env.OLLAMA_BASE_URL?.trim() : undefined);

  let baseUrl = (envBase || pc.baseUrl || DEFAULT_BASE[id] || "").trim();
  if (id === "custom" && !baseUrl) {
    throw new ProviderError({
      code: "config",
      provider: id,
      message: "custom provider requires providers.custom.base_url",
      hint: 'Set base_url under [providers.custom], e.g. "https://api.deepseek.com"',
    });
  }

  if (id !== "anthropic") {
    baseUrl = normalizeOpenAiBase(baseUrl);
  } else {
    baseUrl = baseUrl.replace(/\/$/, "");
  }

  const apiKeyEnv = pc.apiKeyEnv;
  const apiKey = apiKeyEnv ? env[apiKeyEnv] : undefined;

  if (id !== "ollama" && !apiKey) {
    throw new ProviderError({
      code: "config",
      provider: id,
      message: `${apiKeyEnv ?? "API key"} is not set`,
      hint: apiKeyEnv
        ? `Export ${apiKeyEnv}=... (BYOK) or use WANWU_FORCE_DETERMINISTIC=1`
        : "Configure api_key_env for this provider",
    });
  }

  return {
    id,
    model,
    apiKey,
    baseUrl,
    kind: id === "anthropic" ? "anthropic" : "openai-compat",
  };
}

export function hasProviderCredentials(
  config: WanwuConfig,
  opts?: { providerId?: ProviderId; env?: NodeJS.ProcessEnv },
): boolean {
  try {
    resolveProvider(config, opts);
    return true;
  } catch {
    return false;
  }
}
