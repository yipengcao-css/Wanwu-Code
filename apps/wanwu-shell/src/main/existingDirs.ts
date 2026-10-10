import { existsSync, statSync } from "node:fs";

/** Keep only paths that are still directories. */
export function existingDirectories(dirs: string[]): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    if (typeof dir !== "string" || !dir.trim()) continue;
    try {
      if (existsSync(dir) && statSync(dir).isDirectory()) out.push(dir);
    } catch {
      /* missing or unreadable */
    }
  }
  return out;
}
