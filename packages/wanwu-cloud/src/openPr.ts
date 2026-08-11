import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredTask } from "./store.js";
import { loadTask, saveTask } from "./store.js";

export interface OpenPrOptions {
  repoRoot: string;
  taskId: string;
  /** When true, never call gh/git push — only write pr-draft.md */
  dryRun?: boolean;
  baseBranch?: string;
  /** Inject for tests */
  runner?: typeof spawnSync;
}

export interface OpenPrResult {
  ok: boolean;
  dryRun: boolean;
  prUrl?: string;
  draftPath?: string;
  message: string;
}

function detectBaseBranch(repoRoot: string, runner: typeof spawnSync): string {
  const fromEnv = process.env.WANWU_CLOUD_BASE_BRANCH?.trim();
  if (fromEnv) return fromEnv;
  const sym = runner("git", ["rev-parse", "--abbrev-ref", "origin/HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const out = (sym.stdout ?? "").trim();
  if (out.includes("/")) return out.split("/").pop() || "main";
  return "main";
}

/**
 * Push task branch and open a **draft** PR (never merges).
 * Falls back to pr-draft.md when dry-run or gh fails.
 */
export function openTaskPullRequest(opts: OpenPrOptions): OpenPrResult {
  const runner = opts.runner ?? spawnSync;
  const dryRun =
    opts.dryRun === true ||
    process.env.WANWU_CLOUD_PR_DRY_RUN === "1" ||
    process.env.WANWU_CLOUD_OPEN_PR === "0";

  const task = loadTask(opts.repoRoot, opts.taskId);
  if (!task?.branch || !task.worktree) {
    return { ok: false, dryRun, message: "task missing branch/worktree — run the task first" };
  }

  const base = opts.baseBranch ?? detectBaseBranch(opts.repoRoot, runner);
  const title = `wanwu cloud: ${task.id}`;
  const body = [
    `## Cloud task (review-first)`,
    "",
    `- **task**: \`${task.id}\``,
    `- **prompt**: ${task.prompt}`,
    `- **branch**: \`${task.branch}\``,
    "",
    "This PR was opened by `wanwu cloud` in **draft** mode.",
    "**Do not auto-merge.** Review `review.diff` / commits before approving.",
    "",
    task.diffPath && existsSync(task.diffPath)
      ? `Local review diff: \`.wanwu/cloud-tasks/${task.id}/review.diff\``
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const draftPath = join(opts.repoRoot, ".wanwu", "cloud-tasks", task.id, "pr-draft.md");
  writeFileSync(
    draftPath,
    `# PR draft\n\nbase: ${base}\nhead: ${task.branch}\ntitle: ${title}\n\n${body}\n\n## Commands\n\n\`\`\`bash\ngit push -u origin ${task.branch}\ngh pr create --draft --base ${base} --head ${task.branch} --title ${JSON.stringify(title)} --body-file .wanwu/cloud-tasks/${task.id}/pr-draft.md\n\`\`\`\n`,
    "utf8",
  );

  if (dryRun) {
    const next = { ...task, prDraftPath: draftPath, updatedAt: new Date().toISOString() };
    saveTask(opts.repoRoot, next);
    return {
      ok: true,
      dryRun: true,
      draftPath,
      message: `dry-run: wrote ${draftPath} (no push / no gh)`,
    };
  }

  const push = runner("git", ["push", "-u", "origin", task.branch], {
    cwd: task.worktree,
    encoding: "utf8",
  });
  if ((push.status ?? 1) !== 0) {
    return {
      ok: false,
      dryRun: false,
      draftPath,
      message: `git push failed: ${push.stderr || push.stdout || "unknown"}`,
    };
  }

  const pr = runner(
    "gh",
    [
      "pr",
      "create",
      "--draft",
      "--base",
      base,
      "--head",
      task.branch,
      "--title",
      title,
      "--body",
      body,
    ],
    { cwd: opts.repoRoot, encoding: "utf8" },
  );

  const combined = `${pr.stdout ?? ""}\n${pr.stderr ?? ""}`;
  const urlMatch = combined.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  if ((pr.status ?? 1) !== 0 || !urlMatch) {
    return {
      ok: false,
      dryRun: false,
      draftPath,
      message: `gh pr create failed (draft saved): ${combined.slice(0, 500)}`,
    };
  }

  const prUrl = urlMatch[0];
  const next: StoredTask = {
    ...task,
    prUrl,
    prDraftPath: draftPath,
    updatedAt: new Date().toISOString(),
  };
  saveTask(opts.repoRoot, next);

  return {
    ok: true,
    dryRun: false,
    prUrl,
    draftPath,
    message: `draft PR opened: ${prUrl}`,
  };
}
