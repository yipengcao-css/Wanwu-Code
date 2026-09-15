import type { FetchLike } from "./types.js";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface FetchRetryOptions {
  /** Per-attempt timeout (default 60s, env WANWU_HTTP_TIMEOUT_MS). */
  timeoutMs?: number;
  /** Max retries after the first attempt (default 3, env WANWU_HTTP_RETRIES). */
  retries?: number;
  /** Backoff base ms (default 1000, env WANWU_HTTP_RETRY_BASE_MS — tests use 1). */
  retryBaseMs?: number;
  /** Caller cancellation — abort from here never retries. */
  signal?: AbortSignal;
}

function envNumber(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number, base: number): number {
  const jitter = Math.floor(Math.random() * base * 0.5);
  return Math.min(base * 2 ** attempt + jitter, 30_000);
}

/**
 * fetch with per-attempt timeout + exponential backoff on 429/5xx and
 * network errors. Caller aborts and non-retryable statuses return at once.
 * Retry wraps only the initial request — once a response arrives (including
 * SSE streams), the caller owns the body.
 */
export async function fetchWithRetry(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  opts?: FetchRetryOptions,
): Promise<Response> {
  const retries = opts?.retries ?? envNumber("WANWU_HTTP_RETRIES", 3);
  const timeoutMs = opts?.timeoutMs ?? envNumber("WANWU_HTTP_TIMEOUT_MS", 60_000);
  const base = opts?.retryBaseMs ?? envNumber("WANWU_HTTP_RETRY_BASE_MS", 1000);

  let attempt = 0;
  for (;;) {
    if (opts?.signal?.aborted) {
      throw opts.signal.reason instanceof Error ? opts.signal.reason : new Error("aborted");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const onCallerAbort = () => {
      controller.abort(
        opts?.signal?.reason instanceof Error ? opts.signal.reason : new Error("aborted"),
      );
    };
    opts?.signal?.addEventListener("abort", onCallerAbort, { once: true });

    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      if (!res.ok && RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        await res.arrayBuffer().catch(() => undefined); // drain before retry
        await sleep(backoffMs(attempt, base));
        attempt += 1;
        continue;
      }
      return res;
    } catch (err) {
      if (opts?.signal?.aborted) throw err;
      if (attempt >= retries) throw err;
      await sleep(backoffMs(attempt, base));
      attempt += 1;
    } finally {
      clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onCallerAbort);
    }
  }
}
