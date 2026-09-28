import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read the on-disk codebase index and return a few keyword hits.
 * Does not rebuild the index (that happens on the agent turn).
 */

interface PeekChunk {
  startLine?: number;
  endLine?: number;
  text?: string;
  tokens?: string[];
}

interface PeekFile {
  chunks?: PeekChunk[];
}

interface PeekStore {
  version?: number;
  files?: Record<string, PeekFile>;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z_][a-z0-9_]{1,}|[一-鿿]{2,}/g) ?? [];
}

export function queryFromPrefix(prefix: string): string {
  const ids = prefix.slice(-500).match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? [];
  return ids.slice(-6).join(" ");
}

export function peekIndex(root: string, query: string, limit = 3): string {
  const q = tokenize(query);
  if (!root || !q.length) return "";
  const path = join(root, ".wanwu", "index", "codebase.json");
  if (!existsSync(path)) return "";
  let store: PeekStore;
  try {
    store = JSON.parse(readFileSync(path, "utf8")) as PeekStore;
  } catch {
    return "";
  }
  if (store.version !== 1 || !store.files) return "";
  const hits: Array<{ score: number; line: string }> = [];
  for (const [file, body] of Object.entries(store.files)) {
    for (const chunk of body.chunks ?? []) {
      const tokens = chunk.tokens ?? tokenize(chunk.text ?? "");
      if (!tokens.length) continue;
      const counts = new Map<string, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
      let score = 0;
      for (const term of new Set(q)) score += counts.get(term) ?? 0;
      if (score <= 0) continue;
      const text = (chunk.text ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
      hits.push({
        score,
        line: `${file}:${chunk.startLine ?? 1} ${text}`,
      });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits
    .slice(0, limit)
    .map((h) => h.line)
    .join("\n");
}
