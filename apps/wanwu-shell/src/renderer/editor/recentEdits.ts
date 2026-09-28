/** Ring buffer of the developer's latest edits, sent with Tab prediction. */

export interface RecentEdit {
  path: string;
  text: string;
}

const MAX = 8;
const edits: RecentEdit[] = [];

export function noteRecentEdit(path: string, text: string): void {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!clean) return;
  const last = edits[edits.length - 1];
  if (last && last.path === path && last.text === clean) return;
  edits.push({ path, text: clean });
  if (edits.length > MAX) edits.shift();
}

export function recentEditSummary(): string {
  return edits.map((e) => `${e.path}: ${e.text}`).join("\n");
}

export function resetRecentEdits(): void {
  edits.length = 0;
}
