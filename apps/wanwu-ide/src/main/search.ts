import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import type { SearchMatch } from "../shared/ipc.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "out", ".turbo", "coverage"]);
const MAX_RESULTS = 500;
const MAX_FILE_BYTES = 1024 * 1024;

export async function searchText(root: string | null, query: string): Promise<SearchMatch[]> {
  const results: SearchMatch[] = [];
  if (!root || query.trim().length === 0) return results;
  const needle = query.toLowerCase();

  async function walk(dir: string): Promise<void> {
    if (results.length >= MAX_RESULTS) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(full);
          if (stat.size > MAX_FILE_BYTES) continue;
          const buf = await fs.readFile(full);
          if (buf.includes(0)) continue; // skip binaries
          const text = buf.toString("utf8");
          const lines = text.split("\n");
          for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i]!;
            if (line.toLowerCase().includes(needle)) {
              results.push({
                path: full,
                line: i + 1,
                preview: line.trim().slice(0, 200),
              });
              if (results.length >= MAX_RESULTS) return;
            }
          }
        } catch {
          /* ignore unreadable files */
        }
      }
    }
  }

  await walk(root);
  return results.map((r) => ({ ...r, path: relative(root, r.path) }));
}
