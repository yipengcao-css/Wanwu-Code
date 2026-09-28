import type { ProviderId, WanwuConfig } from "@wanwu/config";
import { completeChat } from "./complete.js";
import { resolveCompletionModel } from "./inlineComplete.js";
import { resolveProvider } from "./resolve.js";
import type { FetchLike } from "./types.js";

/**
 * Cursor-style next-edit prediction.
 * A small completion model (not the agent model) looks at recent edits and
 * may point somewhere other than the cursor.
 */

export interface NextEdit {
  action: "insert" | "replace" | "none";
  /** 1-based */
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  text: string;
}

export type NextEditMode = "inline" | "jump" | "none";

export function parseNextEdit(raw: string): NextEdit | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const action = data.action === "insert" || data.action === "replace" || data.action === "none"
    ? data.action
    : null;
  if (!action) return null;
  const line = num(data.line);
  const column = num(data.column);
  const endLine = num(data.endLine ?? data.line);
  const endColumn = num(data.endColumn ?? data.column);
  const text = typeof data.text === "string" ? data.text.replace(/\r\n/g, "\n") : "";
  if (!line || !column || !endLine || !endColumn) {
    return action === "none" ? { action, line: 1, column: 1, endLine: 1, endColumn: 1, text: "" } : null;
  }
  if (text.length > 800) return null;
  return { action, line, column, endLine, endColumn, text: text.replace(/[ \t]+$/g, "") };
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n);
}

/**
 * Ghost text only when the edit starts at the cursor.
 * Any other location is a jump: Tab moves there, then the text is offered.
 */
export function classifyNextEdit(
  edit: NextEdit,
  cursorLine: number,
  cursorColumn: number,
): NextEditMode {
  if (edit.action === "none" || !edit.text.trim()) return "none";
  if (edit.line === cursorLine && edit.column === cursorColumn) return "inline";
  return "jump";
}

/** Accept one word of a ghost suggestion (leading indent stays with the word). */
export function takeNextWord(text: string): { take: string; rest: string } {
  const m = /^(\s*)(\w+|[^\s\w]+)/.exec(text);
  if (!m) return { take: text, rest: "" };
  const take = `${m[1] ?? ""}${m[2] ?? ""}`;
  return { take, rest: text.slice(take.length) };
}

/** Accept through the next newline, including the newline. */
export function takeNextLine(text: string): { take: string; rest: string } {
  const i = text.indexOf("\n");
  if (i < 0) return { take: text, rest: "" };
  const take = text.slice(0, i + 1);
  return { take, rest: text.slice(take.length) };
}

export interface PredictNextEditOptions {
  config: WanwuConfig;
  prefix: string;
  suffix: string;
  cursorLine: number;
  cursorColumn: number;
  language?: string;
  filePath?: string;
  diagnostics?: string;
  recentEdits?: string;
  indexContext?: string;
  model?: string;
  providerId?: ProviderId;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
}

export async function predictNextEdit(
  opts: PredictNextEditOptions,
): Promise<{ edit: NextEdit; mode: NextEditMode; model: string }> {
  const resolved = resolveProvider(opts.config, {
    providerId: opts.providerId,
    env: opts.env,
  });
  const model = resolveCompletionModel(opts.config, resolved.id, opts.model ?? resolved.model);
  const r = await completeChat({
    config: opts.config,
    providerId: resolved.id,
    fetchImpl: opts.fetchImpl,
    env: opts.env,
    request: {
      model,
      temperature: 0,
      maxTokens: 280,
      messages: [
        {
          role: "system",
          content: [
            "You predict the single next code edit a developer is about to make.",
            "Use the recent edits, diagnostics, and indexed snippets. The edit may be away from the cursor.",
            "Reply with JSON only, no markdown:",
            '{"action":"insert"|"replace"|"none","line":1,"column":1,"endLine":1,"endColumn":1,"text":""}',
            "line and column are 1-based. insert puts text at line,column. replace overwrites the range with text.",
            "text is raw source, at most 12 lines. If nothing useful, action is none.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            opts.filePath ? `File: ${opts.filePath}` : "",
            opts.language ? `Language: ${opts.language}` : "",
            `Cursor: ${opts.cursorLine}:${opts.cursorColumn}`,
            opts.diagnostics?.trim() ? `Diagnostics:\n${opts.diagnostics.trim()}` : "",
            opts.recentEdits?.trim() ? `Recent edits:\n${opts.recentEdits.trim()}` : "",
            opts.indexContext?.trim() ? `Indexed code:\n${opts.indexContext.trim()}` : "",
            `<prefix>\n${opts.prefix}<cursor>\n</prefix>`,
            `<suffix>\n${opts.suffix}\n</suffix>`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    },
  });
  const edit = parseNextEdit(r.text) ?? {
    action: "none" as const,
    line: opts.cursorLine,
    column: opts.cursorColumn,
    endLine: opts.cursorLine,
    endColumn: opts.cursorColumn,
    text: "",
  };
  return {
    edit,
    mode: classifyNextEdit(edit, opts.cursorLine, opts.cursorColumn),
    model,
  };
}
