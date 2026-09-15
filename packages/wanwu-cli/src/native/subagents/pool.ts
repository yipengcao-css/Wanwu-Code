import { runSubagent } from "./runner.js";
import type { SubagentBatchResult, SubagentRunOptions, SubagentSpec } from "./types.js";

/** Module-level coder mutex: coder subagents run one at a time (edit safety). */
let coderChain: Promise<unknown> = Promise.resolve();

function runCoderSerialized(
  spec: SubagentSpec,
  opts: SubagentRunOptions,
): Promise<import("./types.js").SubagentResult> {
  const p = coderChain.then(
    () => runSubagent(spec, opts),
    () => runSubagent(spec, opts),
  );
  coderChain = p.catch(() => undefined);
  return p;
}

/**
 * Run subagents with bounded concurrency.
 * coder subagents are serialized via a shared mutex chain.
 */
export async function runSubagents(
  specs: SubagentSpec[],
  opts: SubagentRunOptions,
): Promise<SubagentBatchResult> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 2, 4));
  const results: Array<import("./types.js").SubagentResult | undefined> = new Array(
    specs.length,
  );

  let index = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = index;
      index += 1;
      if (i >= specs.length) return;
      const spec = specs[i]!;
      results[i] =
        spec.kind === "coder"
          ? await runCoderSerialized(spec, opts)
          : await runSubagent(spec, opts);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, specs.length) }, () =>
    worker(),
  );
  await Promise.all(workers);

  const finalResults = results.map((r, i) => {
    if (r) return r;
    return {
      id: `sub-missing-${i}`,
      kind: specs[i]!.kind,
      name: specs[i]!.name ?? specs[i]!.kind,
      ok: false,
      summary: "not executed",
      toolsUsed: [],
      history: [],
      error: "not executed",
    };
  });

  const aggregateText = finalResults
    .map((r) => `## ${r.name} (${r.kind})\n\n${r.summary}`)
    .join("\n\n---\n\n");

  return { results: finalResults, aggregateText };
}
