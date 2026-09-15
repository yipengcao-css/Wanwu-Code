import { fetchWithRetry, type FetchLike } from "@wanwu/providers";
import type { ToolResult } from "./tools.js";

const DEFAULT_FETCH_MAX_CHARS = 20_000;
const MAX_BODY_BYTES = 512 * 1024;

function fetchMaxChars(): number {
  return Number(process.env.WANWU_WEB_FETCH_MAX_CHARS ?? "") || DEFAULT_FETCH_MAX_CHARS;
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Crude but safe HTML → text: drop script/style, strip tags, decode common entities. */
export function htmlToText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
      if (total >= maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  }
  return new TextDecoder().decode(
    chunks.length === 1 ? chunks[0] : concatBytes(chunks),
  );
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

export async function toolWebFetch(
  url: string,
  opts?: { fetchImpl?: FetchLike },
): Promise<ToolResult> {
  if (!isHttpUrl(url)) {
    return { ok: false, title: "WebFetch", text: `only http(s) URLs allowed: ${url}` };
  }
  let res: Response;
  try {
    res = await fetchWithRetry(opts?.fetchImpl ?? fetch, url, {
      headers: { "user-agent": "wanwu-cli/1.0 (+https://github.com/yipengcao-css/Wanwu-Code)" },
      redirect: "follow",
    });
  } catch (err) {
    return { ok: false, title: "WebFetch", text: `fetch failed: ${String(err)}` };
  }
  if (!res.ok) {
    return { ok: false, title: "WebFetch", text: `HTTP ${res.status} for ${url}` };
  }
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await readBodyCapped(res, MAX_BODY_BYTES);
  const isHtml = /text\/html|application\/xhtml/i.test(contentType);
  const text = isHtml ? htmlToText(raw) : raw;
  const max = fetchMaxChars();
  const clipped = text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;
  return {
    ok: true,
    title: "WebFetch",
    text: `URL: ${url}\nContent-Type: ${contentType}\n\n${clipped}`,
  };
}

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

/** Parse DuckDuckGo html endpoint results (keyless default). */
export function parseDuckDuckGoHtml(html: string, limit = 8): WebSearchHit[] {
  const links: Array<{ title: string; url: string }> = [];
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) && links.length < limit) {
    const rawUrl = m[1] ?? "";
    // DDG wraps targets in //duckduckgo.com/l/?uddg=<encoded>
    const uddg = rawUrl.match(/[?&]uddg=([^&]+)/);
    const url = uddg?.[1] ? decodeURIComponent(uddg[1]) : rawUrl;
    const title = htmlToText(m[2] ?? "").trim();
    if (title && url) links.push({ title, url });
  }
  const snippets: string[] = [];
  const snipRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  while ((m = snipRe.exec(html)) && snippets.length < limit) {
    snippets.push(htmlToText(m[1] ?? "").trim());
  }
  return links.map((l, i) => ({ ...l, snippet: snippets[i] ?? "" }));
}

export async function toolWebSearch(
  query: string,
  opts?: { fetchImpl?: FetchLike },
): Promise<ToolResult> {
  const q = query.trim();
  if (!q) return { ok: false, title: "WebSearch", text: "empty query" };
  const endpoint =
    process.env.WANWU_WEB_SEARCH_URL ?? "https://html.duckduckgo.com/html/?q={q}";
  const url = endpoint.replace("{q}", encodeURIComponent(q));
  let res: Response;
  try {
    res = await fetchWithRetry(opts?.fetchImpl ?? fetch, url, {
      headers: { "user-agent": "wanwu-cli/1.0 (+https://github.com/yipengcao-css/Wanwu-Code)" },
    });
  } catch (err) {
    return { ok: false, title: "WebSearch", text: `search failed: ${String(err)}` };
  }
  if (!res.ok) {
    return { ok: false, title: "WebSearch", text: `search HTTP ${res.status}` };
  }
  const html = await readBodyCapped(res, MAX_BODY_BYTES);
  const hits = parseDuckDuckGoHtml(html);
  if (!hits.length) {
    return {
      ok: true,
      title: "WebSearch",
      text: `no parsed results for "${q}" (endpoint: ${endpoint})`,
    };
  }
  const text = hits
    .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`)
    .join("\n\n");
  return { ok: true, title: "WebSearch", text: `Results for "${q}":\n\n${text}` };
}
