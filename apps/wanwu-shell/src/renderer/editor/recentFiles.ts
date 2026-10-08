export const RECENT_FILE_LIMIT = 8;

/** Most recently focused file first. The active file stays in the ring so it remains after a switch. */
export function rememberViewed(
  prev: readonly string[],
  path: string | null | undefined,
  limit = RECENT_FILE_LIMIT,
): string[] {
  const next = path?.trim();
  if (!next) return prev.slice(0, limit);
  return [next, ...prev.filter((item) => item !== next)].slice(0, limit);
}
