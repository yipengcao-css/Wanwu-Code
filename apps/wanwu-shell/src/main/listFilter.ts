/** Directories the file tree and search walk never descend into. */
export const LIST_SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  "code-oss",
  ".wanwu",
  "coverage",
]);

/** Dotfiles such as `.wanwuignore` stay visible. Heavy and secret directories stay hidden. */
export function shouldListEntry(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  return !LIST_SKIP.has(name);
}
