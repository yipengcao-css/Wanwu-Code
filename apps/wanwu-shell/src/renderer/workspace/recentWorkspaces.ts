export const RECENT_WORKSPACES_KEY = "wanwu.recentWorkspaces";
export const RECENT_WORKSPACES_MAX = 8;

export function readRecentWorkspaces(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const dirs = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return dirs.slice(0, RECENT_WORKSPACES_MAX);
  } catch {
    return [];
  }
}

/** Newest first. Opening the same folder again moves it to the front. */
export function rememberWorkspace(raw: string | null, dir: string): string {
  const trimmed = dir.trim();
  const next = [trimmed, ...readRecentWorkspaces(raw).filter((item) => item !== trimmed)].slice(
    0,
    RECENT_WORKSPACES_MAX,
  );
  return JSON.stringify(next);
}

export function workspaceLabel(dir: string): string {
  const parts = dir.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/") || dir;
}
