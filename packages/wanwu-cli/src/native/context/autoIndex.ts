import { ensureCodebaseIndex } from "../codebaseIndex/indexer.js";
import { formatSearchHits, searchStore } from "../codebaseIndex/search.js";
import { loadIndex } from "../codebaseIndex/store.js";
import type { WanwuConfig } from "@wanwu/config";
import type { FetchLike } from "@wanwu/providers";

/** Query string for automatic retrieval. Drops host editor/skill wrappers. */
export function indexQueryFromPrompt(prompt: string, activePath?: string): string {
  const stripped = prompt
    .replace(/\[EDITOR_CONTEXT\][\s\S]*?\[\/EDITOR_CONTEXT\]/g, " ")
    .replace(/\[SKILL_IMPORT[\s\S]*?\[\/SKILL_IMPORT\]/g, " ")
    .replace(/\[SKILLS=[^\]]*\]/g, " ")
    .replace(/\[SKILLFILE=[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  return [activePath, stripped].filter(Boolean).join(" ");
}

/**
 * Snippets from the codebase index for this turn.
 * Uses the on-disk index. Builds a keyword index once if it is missing
 * (skipped under vitest unless WANWU_AUTO_INDEX=1).
 */
export async function autoIndexContext(
  root: string,
  prompt: string,
  opts: {
    activePath?: string;
    config?: WanwuConfig;
    fetchImpl?: FetchLike;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<string> {
  if (process.env.WANWU_AUTO_INDEX === "0") return "";
  const query = indexQueryFromPrompt(prompt, opts.activePath);
  if (query.trim().length < 8) return "";
  let store = loadIndex(root);
  if (!store) {
    if (process.env.VITEST && process.env.WANWU_AUTO_INDEX !== "1") return "";
    const built = await ensureCodebaseIndex(root, {
      config: opts.config,
      fetchImpl: opts.fetchImpl,
      env: opts.env,
      forceKeyword: true,
    });
    store = built.store;
  }
  const hits = searchStore(store, query, 4);
  if (!hits.length) return "";
  return formatSearchHits(hits, 400);
}
