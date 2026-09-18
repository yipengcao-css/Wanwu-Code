/**
 * Poll an HTTP URL until the server accepts connections.
 * Used so Electron does not load Vite before it is listening
 * (Windows first-start often exceeds a fixed sleep).
 */
export async function waitForHttp(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const intervalMs = options.intervalMs ?? 200;
  const shouldAbort = options.shouldAbort ?? (() => null);
  const started = Date.now();
  let lastErr = "no attempt";

  while (Date.now() - started < timeoutMs) {
    const abortReason = shouldAbort();
    if (abortReason) {
      throw new Error(abortReason);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res) return true;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error(`Timed out waiting for ${url} (${lastErr})`);
}
