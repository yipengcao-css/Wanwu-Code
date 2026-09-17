import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export type SearchMatch = {
  path: string;
  line: number;
  preview: string;
};

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "out", "code-oss", ".turbo", "coverage"]);
const MAX_RESULTS = 500;
const MAX_FILE_BYTES = 1024 * 1024;

async function searchText(root: string, query: string): Promise<SearchMatch[]> {
  const results: SearchMatch[] = [];
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
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(full);
          if (stat.size > MAX_FILE_BYTES) continue;
          const buf = await fs.readFile(full);
          if (buf.includes(0)) continue; // binary
          const lines = buf.toString("utf8").split("\n");
          for (let i = 0; i < lines.length; i += 1) {
            if (lines[i]!.toLowerCase().includes(needle)) {
              results.push({
                path: path.relative(root, full).split(path.sep).join("/"),
                line: i + 1,
                preview: lines[i]!.trim().slice(0, 200),
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
  return results;
}

export function registerSearchIpc(getRoot: () => string | null): void {
  ipcMain.handle("search:text", async (_e, query: string): Promise<SearchMatch[]> => {
    const root = getRoot();
    if (!root || query.trim().length === 0) return [];
    return searchText(root, query.trim());
  });
}
