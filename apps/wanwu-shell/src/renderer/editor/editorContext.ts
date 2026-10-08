/** What the agent should see of the file the user is looking at. */

export interface CursorFocus {
  path: string;
  line: number;
  column: number;
  startLine?: number;
  endLine?: number;
  /** Numbered lines around the caret. Omitted when a selection is sent instead. */
  text?: string;
}

const RADIUS = 24;
const MAX_CHARS = 3500;

/** Lines around the caret, numbered, clipped so a huge line does not flood the prompt. */
export function formatCursorWindow(
  source: string,
  line: number,
  column: number,
): { startLine: number; endLine: number; column: number; text: string } {
  const lines = source.split("\n");
  const count = Math.max(lines.length, 1);
  const at = Math.min(Math.max(Math.floor(line) || 1, 1), count);
  let start = Math.max(1, at - RADIUS);
  let end = Math.min(count, at + RADIUS);
  const render = (): string =>
    lines
      .slice(start - 1, end)
      .map((text, i) => `${start + i}|${text}`)
      .join("\n");
  let text = render();
  while (text.length > MAX_CHARS && end - start > 4) {
    if (at - start > end - at) start += 1;
    else end -= 1;
    text = render();
  }
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
  return { startLine: start, endLine: end, column: Math.max(Math.floor(column) || 1, 1), text };
}

/** Keep diagnostics that belong to the file on screen. */
export function diagnosticsForActiveFile(summary: string | undefined, path: string | null): string {
  if (!summary || !path) return "";
  const trimmed = summary.trim();
  if (!trimmed || trimmed === "(no diagnostics)") return "";
  const prefix = `${path}:`;
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix))
    .slice(0, 12)
    .join("\n");
}

export function buildEditorContext(opts: {
  activePath: string | null;
  openTabs?: string[];
  selection?: { path: string; text: string; startLine: number; endLine: number } | null;
  cursor?: CursorFocus | null;
  diagnostics?: string;
}): string {
  const lines: string[] = [];
  if (opts.activePath) lines.push(`Active file: ${opts.activePath}`);
  const tabs = (opts.openTabs ?? []).filter(Boolean);
  if (tabs.length) lines.push(`Open tabs: ${tabs.join(", ")}`);
  const cursor =
    opts.cursor && (!opts.activePath || opts.cursor.path === opts.activePath) ? opts.cursor : null;
  if (cursor) {
    lines.push(`Cursor: ${cursor.path}:${cursor.line}:${cursor.column}`);
  }
  const selection = opts.selection?.text.trim() ? opts.selection : null;
  if (selection) {
    lines.push(`Selection (${selection.path}:${selection.startLine}-${selection.endLine}):`);
    lines.push("```");
    lines.push(selection.text.slice(0, 8000));
    lines.push("```");
  } else if (cursor?.text) {
    const start = cursor.startLine ?? cursor.line;
    const end = cursor.endLine ?? cursor.line;
    lines.push(`Around cursor (${cursor.path}:${start}-${end}):`);
    lines.push("```");
    lines.push(cursor.text);
    lines.push("```");
  }
  const diagnostics = opts.diagnostics?.trim();
  if (diagnostics) {
    lines.push("Diagnostics:");
    lines.push(diagnostics);
  }
  return lines.length ? `[EDITOR_CONTEXT]\n${lines.join("\n")}\n[/EDITOR_CONTEXT]\n` : "";
}
