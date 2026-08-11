import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface MemoryFile {
  path: string;
  kind: "WANWU.md" | "AGENTS.md" | "CLAUDE.md";
  preview: string;
}

const CANDIDATES = ["WANWU.md", "AGENTS.md", "CLAUDE.md"] as const;

export function discoverMemory(cwd: string = process.cwd()): MemoryFile[] {
  const found: MemoryFile[] = [];
  for (const name of CANDIDATES) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    found.push({
      path,
      kind: name,
      preview: text.split("\n").slice(0, 8).join("\n"),
    });
  }
  return found;
}

export function renderMemoryForPrompt(files: MemoryFile[]): string {
  if (files.length === 0) {
    return "";
  }
  return files
    .map((f) => `# Memory from ${f.kind}\n\n${readFileSync(f.path, "utf8").trim()}`)
    .join("\n\n---\n\n");
}