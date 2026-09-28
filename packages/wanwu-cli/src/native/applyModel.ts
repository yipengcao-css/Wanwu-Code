import type { WanwuConfig } from "@wanwu/config";
import { applyEditBlocks, type EditBlock } from "./tools.js";

/**
 * Fast apply pass: the agent states an intent (and maybe a sketch).
 * This model rewrites that into exact old/new hunks that match the file.
 * Exact sketches skip the model.
 */

export function resolveApplyModel(config: WanwuConfig): string | undefined {
  if (process.env.WANWU_APPLY_MODEL?.trim()) return process.env.WANWU_APPLY_MODEL.trim();
  const row = config.providers[config.activeProvider];
  return row?.applyModel || row?.completionModel || undefined;
}

export function parseApplyHunks(raw: string): EditBlock[] {
  const normalized = raw.replace(/\r\n/g, "\n");
  const fenced = normalized.match(/```(?:\w+)?\n([\s\S]*?)```/);
  const body = fenced?.[1] ?? normalized;
  const blocks: EditBlock[] = [];
  const re = /@@OLD\n([\s\S]*?)\n@@NEW\n([\s\S]*?)\n@@END/g;
  for (const match of body.matchAll(re)) {
    const old_string = match[1] ?? "";
    const new_string = match[2] ?? "";
    if (!old_string || old_string === new_string) continue;
    blocks.push({ old_string, new_string });
  }
  return blocks;
}

export function applySystemPrompt(): string {
  return [
    "You are the apply model. Turn an edit intent into exact search/replace hunks.",
    "Copy old text from the file verbatim. Do not reformat unrelated code.",
    "Reply only in this form, one or more hunks:",
    "@@OLD",
    "<exact existing text>",
    "@@NEW",
    "<replacement>",
    "@@END",
  ].join("\n");
}

export function applyUserPrompt(opts: {
  path: string;
  original: string;
  intent: string;
  sketch: EditBlock[];
}): string {
  const sketch = opts.sketch
    .map((b, i) => `sketch ${i + 1} old:\n${b.old_string}\nsketch ${i + 1} new:\n${b.new_string}`)
    .join("\n\n");
  const original = opts.original.length > 20000 ? `${opts.original.slice(0, 20000)}\n…(truncated)` : opts.original;
  return [`File: ${opts.path}`, `Intent: ${opts.intent}`, sketch ? `Sketch:\n${sketch}` : "", `File contents:\n${original}`]
    .filter(Boolean)
    .join("\n\n");
}

export async function materializeEdit(opts: {
  original: string;
  path: string;
  intent: string;
  sketch: EditBlock[];
  complete: (system: string, user: string) => Promise<string>;
}): Promise<{ ok: true; blocks: EditBlock[] } | { ok: false; error: string }> {
  if (opts.sketch.length && applyEditBlocks(opts.original, opts.sketch).ok) {
    return { ok: true, blocks: opts.sketch };
  }
  let raw = "";
  try {
    raw = await opts.complete(
      applySystemPrompt(),
      applyUserPrompt({
        path: opts.path,
        original: opts.original,
        intent: opts.intent,
        sketch: opts.sketch,
      }),
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const blocks = parseApplyHunks(raw);
  if (!blocks.length) {
    return { ok: false, error: "apply model did not return @@OLD/@@NEW hunks" };
  }
  const applied = applyEditBlocks(opts.original, blocks);
  if (!applied.ok) {
    return { ok: false, error: applied.error ?? "apply hunks did not match the file" };
  }
  return { ok: true, blocks };
}
