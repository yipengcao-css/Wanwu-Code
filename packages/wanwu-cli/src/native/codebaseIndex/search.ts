import { embedTexts, type FetchLike } from "@wanwu/providers";
import type { WanwuConfig } from "@wanwu/config";
import { ensureCodebaseIndex, tokenize } from "./indexer.js";
import type { IndexStore, StoredChunk } from "./store.js";

export interface SearchHit {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  text: string;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function keywordScore(queryTokens: string[], chunk: StoredChunk): number {
  if (!chunk.tokens?.length || !queryTokens.length) return 0;
  const counts = new Map<string, number>();
  for (const t of chunk.tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  let score = 0;
  for (const q of new Set(queryTokens)) {
    score += counts.get(q) ?? 0;
  }
  // normalize by chunk length to avoid long-chunk bias
  return score / Math.sqrt(chunk.tokens.length);
}

export interface SearchOptions {
  config?: WanwuConfig;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  limit?: number;
  forceKeyword?: boolean;
}

/** Semantic (embeddings) or keyword search over the incremental index. */
export async function searchCodebase(
  root: string,
  query: string,
  opts: SearchOptions = {},
): Promise<{ hits: SearchHit[]; mode: IndexStore["mode"]; stats: string }> {
  const index = await ensureCodebaseIndex(root, {
    config: opts.config,
    fetchImpl: opts.fetchImpl,
    env: opts.env,
    forceKeyword: opts.forceKeyword,
  });
  const limit = opts.limit ?? 8;
  const hits: SearchHit[] = [];

  if (index.mode === "embeddings" && opts.config) {
    let queryVector: number[] | undefined;
    try {
      const r = await embedTexts({
        config: opts.config,
        texts: [query],
        fetchImpl: opts.fetchImpl,
        env: opts.env,
      });
      queryVector = r.vectors[0];
    } catch {
      queryVector = undefined;
    }
    if (queryVector) {
      for (const [path, file] of Object.entries(index.store.files)) {
        for (const chunk of file.chunks) {
          if (!chunk.vector) continue;
          const score = cosine(queryVector, chunk.vector);
          if (score > 0) hits.push({ path, startLine: chunk.startLine, endLine: chunk.endLine, score, text: chunk.text });
        }
      }
    }
  }

  if (!hits.length) {
    const queryTokens = tokenize(query);
    for (const [path, file] of Object.entries(index.store.files)) {
      for (const chunk of file.chunks) {
        const score = keywordScore(queryTokens, chunk);
        if (score > 0) hits.push({ path, startLine: chunk.startLine, endLine: chunk.endLine, score, text: chunk.text });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return {
    hits: hits.slice(0, limit),
    mode: index.mode,
    stats: `${index.files} files / ${index.chunks} chunks (${index.mode})`,
  };
}

export function formatSearchHits(hits: SearchHit[], clip = 600): string {
  if (!hits.length) return "(no relevant code found)";
  return hits
    .map((h) => {
      const snippet = h.text.length > clip ? `${h.text.slice(0, clip)}\n…` : h.text;
      return `--- ${h.path}:${h.startLine}-${h.endLine} (score ${h.score.toFixed(3)})\n${snippet}`;
    })
    .join("\n\n");
}
