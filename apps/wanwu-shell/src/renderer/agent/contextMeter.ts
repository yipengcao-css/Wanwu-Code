/** Same heuristic as the CLI: CJK ≈ 1 token, other characters ≈ 1/4. */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x4e00 && cp <= 0x9fff) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

export function contextWindowFor(model: string): number {
  const m = model.toLowerCase();
  if (m.includes("gemini")) return 1_000_000;
  if (m.includes("claude")) return 200_000;
  return 128_000;
}

export function contextPercent(tokens: number, windowSize: number): number {
  if (windowSize <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((tokens / windowSize) * 100)));
}
