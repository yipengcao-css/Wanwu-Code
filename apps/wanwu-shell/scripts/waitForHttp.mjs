/**
 * Poll HTTP URL(s) until a server accepts connections.
 * Used so Electron does not load Vite before it is listening
 * (Windows first-start often exceeds a fixed sleep; localhost may be IPv6-only).
 */

/** 127.0.0.1 ↔ localhost — Windows Vite often binds one, Electron loads the other. */
export function candidateDevUrls(primary) {
  const out = [primary];
  try {
    const u = new URL(primary);
    if (u.hostname === "127.0.0.1") {
      u.hostname = "localhost";
      out.push(u.toString());
    } else if (u.hostname === "localhost") {
      u.hostname = "127.0.0.1";
      out.push(u.toString());
    }
  } catch {
    /* keep primary */
  }
  return [...new Set(out)];
}

export async function waitForFirstHttp(urls, options = {}) {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const intervalMs = options.intervalMs ?? 200;
  const shouldAbort = options.shouldAbort ?? (() => null);
  const started = Date.now();
  let lastErr = "no attempt";
  const list = urls.length ? urls : [];

  while (Date.now() - started < timeoutMs) {
    const abortReason = shouldAbort();
    if (abortReason) {
      throw new Error(abortReason);
    }
    for (const url of list) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (res) return url;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Timed out waiting for ${list.join(" or ")} (${lastErr})`);
}

export async function waitForHttp(url, options = {}) {
  await waitForFirstHttp([url], options);
  return true;
}
