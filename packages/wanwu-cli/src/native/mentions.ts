import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { assertInsideWorkspace, PathSandboxError } from "./workspacePaths.js";

/**
 * @-mentions: inline context references in user prompts.
 *
 *   @src/foo.ts        file contents (clipped)
 *   @src/              folder listing (2 levels, capped)
 *   @git:status        git status --short
 *   @git:diff          git diff (clipped)
 *   @git:log           recent commits
 *   @web:<query>       resolved by caller via web search (loop injects results)
 *   @terminal          host-provided terminal output (when available)
 *   @diagnostics       host-provided LSP diagnostics (when available)
 *   @codebase          semantic search using the rest of the prompt as query
 *   @codebase:<query>  semantic search with an explicit query
 */

export type MentionKind = "file" | "folder" | "git" | "web" | "terminal" | "diagnostics" | "codebase";

export interface Mention {
  raw: string;
  kind: MentionKind;
  arg: string;
}

const MENTION_RE =
  /@((git):(status|diff|log)|web:[^\s]+|terminal|diagnostics|codebase(?::[^\s]+)?|[\w./\\-]+)/g;

export function parseMentions(input: string): { text: string; mentions: Mention[] } {
  const mentions: Mention[] = [];
  const text = input.replace(MENTION_RE, (raw, body: string) => {
    if (body.startsWith("git:")) {
      mentions.push({ raw, kind: "git", arg: body.slice(4) });
    } else if (body.startsWith("web:")) {
      mentions.push({ raw, kind: "web", arg: body.slice(4) });
    } else if (body === "terminal" || body === "diagnostics") {
      mentions.push({ raw, kind: body, arg: "" });
    } else if (body === "codebase" || body.startsWith("codebase:")) {
      mentions.push({
        raw,
        kind: "codebase",
        arg: body.startsWith("codebase:") ? body.slice("codebase:".length) : "",
      });
      return body.startsWith("codebase:") ? body.slice("codebase:".length) : "";
    } else {
      mentions.push({ raw, kind: "file", arg: body });
    }
    return body; // keep readable text without the @
  });
  return { text, mentions };
}

const FILE_CLIP = 20_000;
const LIST_CAP = 200;

function readFileMention(root: string, rel: string): string {
  const abs = assertInsideWorkspace(root, rel);
  if (!existsSync(abs)) return `(not found: ${rel})`;
  const st = statSync(abs);
  if (st.isDirectory()) {
    const lines: string[] = [];
    const walk = (dir: string, depth: number): void => {
      if (lines.length >= LIST_CAP || depth > 2) return;
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".git") continue;
        const full = join(dir, name);
        const r = full.slice(root.length + 1);
        try {
          if (statSync(full).isDirectory()) {
            lines.push(`${r}/`);
            walk(full, depth + 1);
          } else {
            lines.push(r);
          }
        } catch {
          /* skip */
        }
        if (lines.length >= LIST_CAP) return;
      }
    };
    walk(abs, 0);
    return lines.length ? lines.join("\n") : "(empty folder)";
  }
  const text = readFileSync(abs, "utf8");
  return text.length > FILE_CLIP ? `${text.slice(0, FILE_CLIP)}\n…(truncated)` : text;
}

function runGit(root: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: root,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, GIT_PAGER: "cat", PAGER: "cat" },
    })
      .toString()
      .slice(0, FILE_CLIP);
  } catch (err) {
    return `(git ${args.join(" ")} failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)})`;
  }
}

export interface MentionHostProviders {
  terminal?: () => string;
  diagnostics?: () => string;
  webSearch?: (query: string) => Promise<string>;
  codebaseSearch?: (query: string) => Promise<string>;
}

/** Resolve mentions to context blocks. Unknown/unavailable kinds degrade to notes. */
export async function resolveMentions(
  root: string,
  mentions: Mention[],
  host?: MentionHostProviders,
): Promise<string> {
  const blocks: string[] = [];
  for (const m of mentions) {
    try {
      switch (m.kind) {
        case "file":
          blocks.push(`[Context @${m.arg}]\n${readFileMention(root, m.arg)}`);
          break;
        case "git": {
          const sub = m.arg === "diff" ? ["diff"] : m.arg === "log" ? ["log", "--oneline", "-20"] : ["status", "--short"];
          blocks.push(`[Context @git:${m.arg}]\n${runGit(root, sub)}`);
          break;
        }
        case "web":
          if (host?.webSearch) {
            blocks.push(`[Context @web:${m.arg}]\n${await host.webSearch(m.arg)}`);
          } else {
            blocks.push(`[Context @web:${m.arg}]\n(web search unavailable in this host)`);
          }
          break;
        case "terminal":
          blocks.push(
            `[Context @terminal]\n${host?.terminal?.() ?? "(terminal output unavailable in this host)"}`,
          );
          break;
        case "diagnostics":
          blocks.push(
            `[Context @diagnostics]\n${host?.diagnostics?.() ?? "(diagnostics unavailable in this host)"}`,
          );
          break;
        case "codebase": {
          const query = m.arg.trim();
          if (!query) {
            blocks.push("[Context @codebase]\n(no query — agent should call SearchCodebase)");
            break;
          }
          if (host?.codebaseSearch) {
            blocks.push(`[Context @codebase:${query}]\n${await host.codebaseSearch(query)}`);
          } else {
            blocks.push(`[Context @codebase:${query}]\n(use SearchCodebase tool)`);
          }
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof PathSandboxError ? err.message : String(err);
      blocks.push(`[Context @${m.arg || m.kind}]\n(unavailable: ${msg})`);
    }
  }
  return blocks.join("\n\n");
}

/** Expand @-mentions in a user prompt; returns prompt + appended context blocks. */
export async function expandMentions(
  root: string,
  input: string,
  host?: MentionHostProviders,
): Promise<{ text: string; context: string; mentions: Mention[] }> {
  const { text, mentions } = parseMentions(input);
  if (!mentions.length) return { text: input, context: "", mentions };
  const fallbackQuery = text
    .replace(/\[MODE=\w+\][^\n]*\n?/g, "")
    .replace(/\[EDITOR_CONTEXT\][\s\S]*?\[\/EDITOR_CONTEXT\]\n?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  const resolved = mentions.map((m) =>
    m.kind === "codebase" && !m.arg.trim() ? { ...m, arg: fallbackQuery } : m,
  );
  const context = await resolveMentions(root, resolved, host);
  return { text, context, mentions: resolved };
}
