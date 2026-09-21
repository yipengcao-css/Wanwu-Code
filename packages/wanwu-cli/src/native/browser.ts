import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fetchWithRetry, type FetchLike } from "@wanwu/providers";
import { htmlToText } from "./web.js";
import { assertInsideWorkspace } from "./workspacePaths.js";
import type { ToolResult } from "./tools.js";

export type BrowserAction = "navigate" | "snapshot" | "screenshot";

export interface BrowserPage {
  url: string;
  title: string;
  html: string;
  text: string;
  fetchedAt: number;
}

const pages = new Map<string, BrowserPage>();

const MAX_HTML = 400_000;
const SNAPSHOT_CHARS = 12_000;

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

/** Headings, links, and buttons — a cheap accessibility-style snapshot. */
export function htmlToSnapshot(html: string, url: string): string {
  const title = extractTitle(html);
  const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => {
    const text = htmlToText(m[2] ?? "").replace(/\n/g, " ").trim();
    return text ? `${"#".repeat(Number(m[1]))} ${text}` : "";
  });
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => {
      const label = htmlToText(m[2] ?? "").replace(/\n/g, " ").trim() || m[1];
      return `- ${label} → ${m[1]}`;
    })
    .slice(0, 40);
  const controls = [...html.matchAll(/<(button|input|textarea|select)\b[^>]*>/gi)]
    .map((m) => {
      const tag = m[1] ?? "control";
      const name = m[0].match(/\bname=["']([^"']+)["']/i)?.[1];
      const type = m[0].match(/\btype=["']([^"']+)["']/i)?.[1];
      const aria = m[0].match(/\baria-label=["']([^"']+)["']/i)?.[1];
      return `- <${tag}${type ? ` type=${type}` : ""}${name ? ` name=${name}` : ""}${aria ? ` ${aria}` : ""}>`;
    })
    .slice(0, 30);
  return [
    `url: ${url}`,
    title ? `title: ${title}` : "",
    headings.filter(Boolean).length ? `headings:\n${headings.filter(Boolean).join("\n")}` : "",
    links.length ? `links:\n${links.join("\n")}` : "",
    controls.length ? `controls:\n${controls.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, SNAPSHOT_CHARS);
}

export function peekBrowserPage(workspaceRoot: string): BrowserPage | undefined {
  return pages.get(workspaceRoot);
}

export function clearBrowserPages(): void {
  pages.clear();
}

async function fetchPage(
  url: string,
  fetchImpl?: FetchLike,
): Promise<{ html: string; title: string; text: string }> {
  const res = await fetchWithRetry(fetchImpl ?? fetch, url, {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1" },
  });
  const raw = await res.text();
  const html = raw.slice(0, MAX_HTML);
  return { html, title: extractTitle(html), text: htmlToText(html).slice(0, SNAPSHOT_CHARS) };
}

const CHROME_FALLBACKS = [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

export function findChromeBin(): string | undefined {
  const env = process.env.WANWU_BROWSER_BIN?.trim();
  const list = env ? [env, ...CHROME_FALLBACKS] : CHROME_FALLBACKS;
  return list.find((p) => existsSync(p));
}

function screenshotWithChrome(
  url: string,
  outPath: string,
  chromeBin?: string | null,
): { ok: boolean; text: string } {
  const bin = chromeBin === null ? undefined : (chromeBin ?? findChromeBin());
  if (!bin) {
    return { ok: false, text: "no chrome/chromium (set WANWU_BROWSER_BIN)" };
  }
  const r = spawnSync(
    bin,
    ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${outPath}`, "--window-size=1280,720", url],
    { encoding: "utf8", timeout: 12_000 },
  );
  if (r.status !== 0 || !existsSync(outPath)) {
    return {
      ok: false,
      text: `chrome screenshot failed (exit ${r.status ?? "?"}): ${(r.stderr || r.stdout || "").slice(0, 400)}`,
    };
  }
  return { ok: true, text: `wrote ${outPath}` };
}

export async function toolBrowser(
  workspaceRoot: string,
  args: { action?: string; url?: string; path?: string },
  opts?: { fetchImpl?: FetchLike; chromeBin?: string | null },
): Promise<ToolResult> {
  const action = (args.action ?? "snapshot") as BrowserAction;
  if (action !== "navigate" && action !== "snapshot" && action !== "screenshot") {
    return { ok: false, title: "Browser", text: "action must be navigate | snapshot | screenshot" };
  }

  if (action === "navigate") {
    const url = String(args.url ?? "");
    if (!isHttpUrl(url)) {
      return { ok: false, title: "Browser", text: "navigate requires an http(s) url" };
    }
    try {
      const page = await fetchPage(url, opts?.fetchImpl);
      const stored: BrowserPage = { url, ...page, fetchedAt: Date.now() };
      pages.set(workspaceRoot, stored);
      return {
        ok: true,
        title: "Browser",
        text: `navigated ${url}\ntitle: ${page.title || "(none)"}\n\n${htmlToSnapshot(page.html, url)}`,
      };
    } catch (err) {
      return {
        ok: false,
        title: "Browser",
        text: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const current = pages.get(workspaceRoot);
  if (!current) {
    return { ok: false, title: "Browser", text: "no page loaded — call Browser navigate first" };
  }

  if (action === "snapshot") {
    return { ok: true, title: "Browser", text: htmlToSnapshot(current.html, current.url) };
  }

  const rel = String(args.path ?? `.wanwu/browser/shot-${Date.now()}.png`).replace(/^\/+/, "");
  let dest: string;
  try {
    dest = assertInsideWorkspace(workspaceRoot, rel);
  } catch (err) {
    return { ok: false, title: "Browser", text: err instanceof Error ? err.message : String(err) };
  }
  mkdirSync(join(dest, ".."), { recursive: true });
  const shot = screenshotWithChrome(current.url, dest, opts?.chromeBin);
  if (shot.ok) {
    return { ok: true, title: "Browser", text: `screenshot ${rel}\n${shot.text}` };
  }
  const md = dest.replace(/\.png$/i, "") + ".md";
  writeFileSync(
    md,
    `# Browser snapshot (no Chrome)\n\n${htmlToSnapshot(current.html, current.url)}\n\n${current.text}\n`,
    "utf8",
  );
  return {
    ok: true,
    title: "Browser",
    text: `screenshot unavailable (${shot.text}). wrote text snapshot ${md.slice(workspaceRoot.length + 1)}`,
  };
}
