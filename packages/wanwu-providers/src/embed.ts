import { fetchWithRetry } from "./http.js";
import { mapHttpError, mapNetworkError } from "./errors.js";
import { resolveProvider } from "./resolve.js";
import type { ProviderId, WanwuConfig } from "@wanwu/config";
import { ProviderError, type FetchLike } from "./types.js";

/** Default embedding models per provider (override: providers.<id>.embedding_model or WANWU_EMBED_MODEL). */
const DEFAULT_EMBED_MODELS: Partial<Record<ProviderId, string>> = {
  openai: "text-embedding-3-small",
  ollama: "nomic-embed-text",
};

export interface EmbedOptions {
  config: WanwuConfig;
  texts: string[];
  providerId?: ProviderId;
  model?: string;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  provider: ProviderId;
}

export function resolveEmbeddingModel(config: WanwuConfig, providerId: ProviderId): string | undefined {
  if (process.env.WANWU_EMBED_MODEL) return process.env.WANWU_EMBED_MODEL;
  const fromConfig = (config.providers[providerId] as { embeddingModel?: string } | undefined)
    ?.embeddingModel;
  return fromConfig ?? DEFAULT_EMBED_MODELS[providerId];
}

/**
 * Embed texts via an OpenAI-compatible /embeddings endpoint.
 * Anthropic has no embeddings API — use openai/ollama/custom for indexing.
 */
export async function embedTexts(opts: EmbedOptions): Promise<EmbedResult> {
  const resolved = resolveProvider(opts.config, {
    providerId: opts.providerId,
    env: opts.env,
  });
  if (resolved.kind === "anthropic") {
    throw new ProviderError({
      code: "config",
      provider: resolved.id,
      message: "anthropic has no embeddings API",
      hint: "Configure openai/ollama/custom for codebase indexing (Ollama stays fully local).",
    });
  }
  const model = opts.model ?? resolveEmbeddingModel(opts.config, resolved.id);
  if (!model) {
    throw new ProviderError({
      code: "config",
      provider: resolved.id,
      message: `no embedding model configured for ${resolved.id}`,
      hint: "Set providers.<id>.embedding_model or WANWU_EMBED_MODEL.",
    });
  }
  if (!opts.texts.length) {
    return { vectors: [], model, provider: resolved.id };
  }

  const url = `${resolved.baseUrl.replace(/\/$/, "")}/embeddings`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (resolved.apiKey) headers.authorization = `Bearer ${resolved.apiKey}`;

  let res: Response;
  try {
    res = await fetchWithRetry(opts.fetchImpl ?? fetch, url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input: opts.texts }),
    });
  } catch (err) {
    throw mapNetworkError(resolved.id, err);
  }
  const bodyText = await res.text();
  if (!res.ok) {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }
  let data: { data?: Array<{ embedding?: number[]; index?: number }> };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }
  const items = (data.data ?? [])
    .map((d, i) => ({ index: d.index ?? i, embedding: d.embedding }))
    .filter((d): d is { index: number; embedding: number[] } => Array.isArray(d.embedding))
    .sort((a, b) => a.index - b.index);
  if (items.length !== opts.texts.length) {
    throw new ProviderError({
      code: "unknown",
      provider: resolved.id,
      message: `embedding count mismatch: got ${items.length}, want ${opts.texts.length}`,
      hint: "Check embedding model support on the configured endpoint.",
    });
  }
  return { vectors: items.map((i) => i.embedding), model, provider: resolved.id };
}
