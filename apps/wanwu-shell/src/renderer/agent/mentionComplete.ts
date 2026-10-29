/** Match an in-progress @-mention token at the end of the composer text. */
export function activeMentionPartial(text: string, caret: number): string | null {
  const head = text.slice(0, caret);
  const m = head.match(/@([\w./\\:-]*)$/);
  return m ? (m[1] ?? "") : null;
}

export function applyMentionInsert(text: string, caret: number, token: string): { text: string; caret: number } {
  const head = text.slice(0, caret);
  const tail = text.slice(caret);
  const m = head.match(/@([\w./\\:-]*)$/);
  if (!m) return { text, caret };
  const start = head.length - m[0].length;
  const insert = token.startsWith("@") ? token : `@${token}`;
  const next = `${text.slice(0, start)}${insert} ${tail}`;
  const nextCaret = start + insert.length + 1;
  return { text: next, caret: nextCaret };
}

export function mergeMentionSuggestions(
  paths: string[],
  specials: string[],
  partial: string,
): string[] {
  const p = partial.toLowerCase();
  const pathHits = paths.map((f) => `@${f}`);
  const specialHits = specials.filter((s) => s.toLowerCase().startsWith(`@${p}`));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hit of [...specialHits, ...pathHits]) {
    if (seen.has(hit)) continue;
    seen.add(hit);
    out.push(hit);
    if (out.length >= 20) break;
  }
  return out;
}
