import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface StoredChunk {
  startLine: number;
  endLine: number;
  text: string;
  vector?: number[];
  /** Keyword tokens for the fallback index. */
  tokens?: string[];
}

export interface StoredFile {
  mtimeMs: number;
  size: number;
  chunks: StoredChunk[];
}

export interface IndexStore {
  version: 1;
  mode: "embeddings" | "keyword";
  model?: string;
  updatedAt: string;
  files: Record<string, StoredFile>;
}

export function indexPath(root: string): string {
  return join(root, ".wanwu", "index", "codebase.json");
}

export function loadIndex(root: string): IndexStore | undefined {
  const path = indexPath(root);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as IndexStore;
    if (parsed.version !== 1 || typeof parsed.files !== "object") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function saveIndex(root: string, store: IndexStore): void {
  const path = indexPath(root);
  mkdirSync(join(path, ".."), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(store), "utf8");
  // atomic-ish rename
  try {
    renameSync(tmp, path);
  } catch {
    writeFileSync(path, readFileSync(tmp, "utf8"), "utf8");
  }
}
