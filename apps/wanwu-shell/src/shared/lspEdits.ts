export type LspTextEdit = {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newText: string;
};

/** Apply LSP text edits. Positions are 0-based. Later edits are applied first. */
export function applyLspTextEdits(text: string, edits: LspTextEdit[]): string {
  if (!edits.length) return text;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const eolLen = eol.length;
  const lines = text.split(/\r?\n/);
  const offsetAt = (line: number, character: number): number => {
    const safeLine = Math.max(0, Math.min(line, lines.length));
    let offset = 0;
    for (let i = 0; i < safeLine; i += 1) offset += (lines[i]?.length ?? 0) + eolLen;
    const lineText = lines[safeLine] ?? "";
    return offset + Math.max(0, Math.min(character, lineText.length));
  };
  const pieces = edits
    .map((edit) => ({
      start: offsetAt(edit.range.start.line, edit.range.start.character),
      end: offsetAt(edit.range.end.line, edit.range.end.character),
      newText: edit.newText.replace(/\r\n/g, "\n").replace(/\n/g, eol),
    }))
    .sort((a, b) => b.start - a.start);
  let out = lines.join(eol);
  for (const piece of pieces) {
    const start = Math.max(0, Math.min(piece.start, out.length));
    const end = Math.max(start, Math.min(piece.end, out.length));
    out = out.slice(0, start) + piece.newText + out.slice(end);
  }
  return out;
}
