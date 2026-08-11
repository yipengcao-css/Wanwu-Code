import { FileCloudClient } from "./client.js";
import { openTaskPullRequest, type OpenPrResult } from "./openPr.js";
import { runCloudTaskLocally } from "./runner.js";
import type { StoredTask } from "./store.js";

export interface OrchestrateOptions {
  repoRoot: string;
  prompts: string[];
  concurrency?: number;
  /** Open draft PRs after each succeeded task */
  openPr?: boolean;
  prDryRun?: boolean;
}

export interface OrchestrateResult {
  startedAt: string;
  finishedAt: string;
  concurrency: number;
  tasks: StoredTask[];
  prResults?: OpenPrResult[];
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Submit and run multiple cloud tasks with bounded concurrency.
 * Each task uses an isolated git worktree; never merges to the base branch.
 */
export async function orchestrateCloudTasks(opts: OrchestrateOptions): Promise<OrchestrateResult> {
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const startedAt = new Date().toISOString();
  const client = new FileCloudClient(opts.repoRoot);

  // Stagger submits slightly so task ids remain unique under Date.now()
  const submitted: StoredTask[] = [];
  for (const prompt of opts.prompts) {
    const t = (await client.submit(prompt)) as StoredTask;
    submitted.push(t);
    await new Promise((r) => setTimeout(r, 5));
  }

  const tasks = await mapPool(submitted, concurrency, async (task) => {
    return runCloudTaskLocally({ repoRoot: opts.repoRoot, taskId: task.id });
  });

  let prResults: OpenPrResult[] | undefined;
  if (opts.openPr) {
    prResults = [];
    for (const task of tasks) {
      if (task.status !== "succeeded") {
        prResults.push({
          ok: false,
          dryRun: Boolean(opts.prDryRun),
          message: `skip PR — task ${task.id} status=${task.status}`,
        });
        continue;
      }
      prResults.push(
        openTaskPullRequest({
          repoRoot: opts.repoRoot,
          taskId: task.id,
          dryRun: opts.prDryRun,
        }),
      );
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    concurrency,
    tasks,
    prResults,
  };
}
