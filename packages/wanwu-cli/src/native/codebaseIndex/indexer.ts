import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { embedTexts, type FetchLike } from "@wanwu/providers";
import type { WanwuConfig } from "@wanwu/config";
import { listWorkspaceFiles } from "../tools.js";
import { chunkFile, looksBinary } from "./chunker.js";
import { loadIndex, saveIndex, type IndexStore, type StoredChunk } from "./store.js";

const MAX_FILE_BYTES = 200 * 1024;
const EMBED_BATCH = 32;
const MAX_INDEX_FILES = 2000;

/** Identifier-ish tokens for the keyword fallback index. */
export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z_][a-z0-9_]{1,}|[一-鿿]{2,}/g);
  return matches ?? [];
}

export interface EnsureIndexOptions {
  config?: WanwuConfig;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  /** Force keyword mode (no embeddings call). */
  forceKeyword?: boolean;
  onProgress?: (msg: string) => void;
}

export interface EnsureIndexResult {
  mode: "embeddings" | "keyword";
  files: number;
  chunks: number;
  updatedFiles: number;
  store: IndexStore;
}

function collectFiles(root: string): Array<{ rel: string; mtimeMs: number; size: number }> {
  const out: Array<{ rel: string; mtimeMs: number; size: number }> = [];
  for (const rel of listWorkspaceFiles(root, MAX_INDEX_FILES * 2)) {
    if (out.length >= MAX_INDEX_FILES) break;
    try {
      const st = statSync(join(root, rel));
      if (st.size > MAX_FILE_BYTES || st.size === 0) continue;
      out.push({ rel, mtimeMs: st.mtimeMs, size: st.size });
    } catch {
      /* skip */
    }
  }
  return out;
}

async function tryEmbedder(
  opts: EnsureIndexOptions,
): Promise<((texts: string[]) => Promise<number[][]>) | undefined> {
  if (opts.forceKeyword || !opts.config) return undefined;
  const config = opts.config;
  return async (texts: string[]) => {
    const r = await embedTexts({ config, texts, fetchImpl: opts.fetchImpl, env: opts.env });
    return r.vectors;
  };
}

/**
 * Build or incrementally update the codebase index.
 * Embeddings when a provider supports it; keyword inverted index otherwise.
 */
export async function ensureCodebaseIndex(
  root: string,
  opts: EnsureIndexOptions = {},
): Promise<EnsureIndexResult> {
  const existing = loadIndex(root);
  const files = collectFiles(root);
  const embedder = await tryEmbedder(opts);

  const store: IndexStore = {
    version: 1,
    mode: embedder ? "embeddings" : "keyword",
    updatedAt: new Date().toISOString(),
    files: {},
  };

  const toEmbed: Array<{ rel: string; chunk: StoredChunk }> = [];
  let updatedFiles = 0;

  for (const f of files) {
    const prev = existing?.files[f.rel];
    if (prev && prev.mtimeMs === f.mtimeMs && prev.size === f.size) {
      store.files[f.rel] = prev; // unchanged
      continue;
    }
    updatedFiles += 1;
    let text: string;
    try {
      text = readFileSync(join(root, f.rel), "utf8");
    } catch {
      continue;
    }
    if (looksBinary(text)) continue;
    const chunks: StoredChunk[] = chunkFile(text).map((c) => ({
      startLine: c.startLine,
      endLine: c.endLine,
      text: c.text,
      tokens: tokenize(c.text),
    }));
    store.files[f.rel] = { mtimeMs: f.mtimeMs, size: f.size, chunks };
    if (embedder) {
      for (const chunk of chunks) toEmbed.push({ rel: f.rel, chunk });
    }
  }

  if (embedder && toEmbed.length) {
    opts.onProgress?.(`embedding ${toEmbed.length} chunks from ${updatedFiles} files…`);
    try {
      for (let i = 0; i < toEmbed.length; i += EMBED_BATCH) {
        const batch = toEmbed.slice(i, i + EMBED_BATCH);
        const vectors = await embedder(batch.map((b) => b.chunk.text));
        batch.forEach((b, j) => {
          b.chunk.vector = vectors[j];
        });
      }
    } catch (err) {
      // Embeddings failed (no key / unsupported) — degrade to keyword mode.
      opts.onProgress?.(
        `embeddings unavailable (${err instanceof Error ? err.message.slice(0, 120) : String(err)}); keyword index`,
      );
      store.mode = "keyword";
      for (const f of Object.values(store.files)) {
        for (const c of f.chunks) delete c.vector;
      }
    }
  }

  saveIndex(root, store);
  const chunkCount = Object.values(store.files).reduce((n, f) => n + f.chunks.length, 0);
  return {
    mode: store.mode,
    files: Object.keys(store.files).length,
    chunks: chunkCount,
    updatedFiles,
    store,
  };
}
