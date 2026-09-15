export interface CodeChunk {
  /** 1-based start line. */
  startLine: number;
  /** 1-based end line (inclusive). */
  endLine: number;
  text: string;
}

const CHUNK_CHARS = 1200;
const OVERLAP_LINES = 3;

/** Line-aligned chunks of ~1200 chars with a few overlapping lines for context. */
export function chunkFile(text: string, chunkChars = CHUNK_CHARS, overlapLines = OVERLAP_LINES): CodeChunk[] {
  const lines = text.split("\n");
  const chunks: CodeChunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let size = 0;
    let end = start;
    while (end < lines.length && size + lines[end]!.length + 1 <= chunkChars) {
      size += lines[end]!.length + 1;
      end += 1;
    }
    if (end === start) end = start + 1; // single huge line still progresses
    chunks.push({
      startLine: start + 1,
      endLine: end,
      text: lines.slice(start, end).join("\n"),
    });
    if (end >= lines.length) break;
    start = Math.max(end - overlapLines, start + 1);
  }
  return chunks;
}

/** Binary sniff: NUL byte in the first block means not text. */
export function looksBinary(text: string): boolean {
  return text.slice(0, 512).includes("\0");
}
