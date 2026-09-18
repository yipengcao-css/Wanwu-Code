export const SPECIAL_MENTIONS = [
  { insert: "@git:status", label: "@git:status", hint: "工作区 git 状态" },
  { insert: "@git:diff", label: "@git:diff", hint: "未提交 diff" },
  { insert: "@git:log", label: "@git:log", hint: "最近提交" },
  { insert: "@web:", label: "@web:", hint: "联网搜索（接着输入关键词）" },
  { insert: "@terminal", label: "@terminal", hint: "最近终端输出" },
  { insert: "@diagnostics", label: "@diagnostics", hint: "当前 LSP 诊断" },
] as const;

export type MentionSuggestion = {
  insert: string;
  label: string;
  hint?: string;
  kind: "file" | "special";
};

export type MentionToken = {
  start: number;
  end: number;
  partial: string;
};

/** Find the @token immediately before `cursor`. */
export function mentionTokenAt(text: string, cursor: number): MentionToken | null {
  const before = text.slice(0, cursor);
  const m = before.match(/(?:^|[\s])(@[\w./\\:-]*)$/);
  if (!m) return null;
  const raw = m[1] ?? "";
  return {
    start: before.length - raw.length,
    end: cursor,
    partial: raw.slice(1),
  };
}

function fileMatches(path: string, partial: string): boolean {
  if (!partial) return true;
  const norm = path.replace(/\\/g, "/");
  if (norm.startsWith(partial) || norm.includes(`/${partial}`)) return true;
  const base = norm.split("/").pop() ?? norm;
  return base.toLowerCase().startsWith(partial.toLowerCase());
}

/**
 * Suggest special mentions + workspace files for the current @ token.
 */
export function completeMentions(
  partial: string,
  files: string[],
  limit = 12,
): MentionSuggestion[] {
  const needle = `@${partial}`;
  const specials: MentionSuggestion[] = SPECIAL_MENTIONS.filter(
    (s) => s.insert.startsWith(needle) || s.insert.slice(1).startsWith(partial),
  ).map((s) => ({ insert: s.insert, label: s.label, hint: s.hint, kind: "special" }));

  const pathHits: MentionSuggestion[] = files
    .filter((f) => fileMatches(f, partial))
    .slice(0, limit)
    .map((f) => ({ insert: `@${f}`, label: `@${f}`, kind: "file" as const }));

  return [...specials, ...pathHits].slice(0, limit + specials.length);
}

/** Replace the @token with `insert`, keeping the rest of the text. */
export function applyMention(text: string, token: MentionToken, insert: string): string {
  const after = text.slice(token.end);
  const spacer = insert.endsWith(":") || after.startsWith(" ") ? "" : " ";
  return `${text.slice(0, token.start)}${insert}${spacer}${after}`;
}
