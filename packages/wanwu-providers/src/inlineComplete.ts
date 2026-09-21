import { completeChat } from "./complete.js";
import { mapHttpError, mapNetworkError } from "./errors.js";
import { fetchWithRetry } from "./http.js";
import { resolveProvider } from "./resolve.js";
import type { ProviderId, WanwuConfig } from "@wanwu/config";
import type { FetchLike } from "./types.js";

/**
 * Inline code completion (Tab ghost text).
 * Two strategies:
 * - FIM: providers.<id>.fim = true (or WANWU_FIM=1) → POST /completions
 *   {prompt, suffix} (DeepSeek/Codestral/Ollama style)
 * - chat fallback: strict output contract on /chat/completions
 */

export interface InlineCompleteOptions {
  config: WanwuConfig;
  /** Code before the cursor (caller caps size). */
  prefix: string;
  /** Code after the cursor. */
  suffix: string;
  language?: string;
  filePath?: string;
  /** Nearby linter diagnostics (line:message). Makes chat fallback lint-aware. */
  diagnostics?: string;
  model?: string;
  providerId?: ProviderId;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
}

export interface InlineCompleteResult {
  text: string;
  model: string;
}

/** Strip markdown fences / chatter from chat-fallback completions. */
export function sanitizeCompletion(raw: string): string {
  // Leading indentation is meaningful (cursor may sit at an empty line) —
  // only drop leading blank lines, fences, and trailing whitespace.
  let text = raw.replace(/^(\r?\n)+/, "");
  const fence = text.match(/^```[\w-]*\n([\s\S]*?)(?:\n```|$)/);
  if (fence) text = fence[1]!;
  text = text.replace(/\n```[\s\S]*$/, "");
  return text.replace(/\s+$/, "");
}

function fimEnabled(config: WanwuConfig, providerId: keyof WanwuConfig["providers"]): boolean {
  if (process.env.WANWU_FIM === "1") return true;
  const p = config.providers[providerId] as { fim?: boolean } | undefined;
  return p?.fim === true;
}

function completionModel(config: WanwuConfig, providerId: keyof WanwuConfig["providers"], fallback: string): string {
  if (process.env.WANWU_COMPLETION_MODEL) return process.env.WANWU_COMPLETION_MODEL;
  const p = config.providers[providerId] as { completionModel?: string } | undefined;
  return p?.completionModel ?? fallback;
}

export async function completeInline(opts: InlineCompleteOptions): Promise<InlineCompleteResult> {
  const resolved = resolveProvider(opts.config, {
    providerId: opts.providerId,
    env: opts.env,
  });
  const model = completionModel(opts.config, resolved.id, opts.model ?? resolved.model);

  const lint = opts.diagnostics?.trim();
  if (fimEnabled(opts.config, resolved.id) && resolved.kind === "openai-compat" && !lint) {
    const url = `${resolved.baseUrl.replace(/\/$/, "")}/completions`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (resolved.apiKey) headers.authorization = `Bearer ${resolved.apiKey}`;
    let res: Response;
    try {
      res = await fetchWithRetry(opts.fetchImpl ?? fetch, url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          prompt: opts.prefix,
          suffix: opts.suffix,
          max_tokens: 128,
          temperature: 0.2,
          stop: ["\n\n\n"],
        }),
      });
    } catch (err) {
      throw mapNetworkError(resolved.id, err);
    }
    const bodyText = await res.text();
    if (!res.ok) throw mapHttpError(resolved.id, res.status, bodyText);
    const data = JSON.parse(bodyText) as { choices?: Array<{ text?: string }> };
    return { text: data.choices?.[0]?.text ?? "", model };
  }

  const lang = opts.language ?? "";
  const file = opts.filePath ? `File: ${opts.filePath}\n` : "";
  const r = await completeChat({
    config: opts.config,
    providerId: resolved.id,
    fetchImpl: opts.fetchImpl,
    env: opts.env,
    request: {
      model,
      temperature: 0.1,
      maxTokens: 256,
      messages: [
        {
          role: "system",
          content:
            "You are a code completion engine. Output ONLY the code that belongs at <cursor> — no explanation, no markdown fences. Repeat neither the prefix nor the suffix. Keep it short (one logical completion). If linter errors are provided, prefer a completion that fixes the nearest error.",
        },
        {
          role: "user",
          content: `${file}Language: ${lang}\n${lint ? `Nearby diagnostics:\n${lint}\n\n` : ""}\n<prefix>\n${opts.prefix}<cursor>\n</prefix>\n\n<suffix>\n${opts.suffix}\n</suffix>`,
        },
      ],
    },
  });
  return { text: sanitizeCompletion(r.text), model };
}
