import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ParallelAgentSpec {
  name: string;
  markerRelativePath: string;
  markerContents: string;
}

export interface ParallelRunResult {
  agents: Array<{ name: string; worktree: string; branch: string; marker: string }>;
  collidedOnMain: boolean;
}

/**
 * Spawn N git worktrees and write distinct marker files in each.
 * Proves parallel agents do not clobber the primary checkout.
 */
export function runParallelMarkers(repoRoot: string, specs: ParallelAgentSpec[]): ParallelRunResult {
  const agents: ParallelRunResult["agents"] = [];
  const base = join(repoRoot, ".wanwu", "worktrees");
  mkdirSync(base, { recursive: true });

  for (const spec of specs) {
    const branch = `wanwu/parallel-${spec.name}`;
    const worktree = join(base, spec.name);
    if (existsSync(worktree)) {
      spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: repoRoot });
      spawnSync("git", ["branch", "-D", branch], { cwd: repoRoot });
    }
    const add = spawnSync("git", ["worktree", "add", "-b", branch, worktree, "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if ((add.status ?? 1) !== 0) {
      throw new Error(`worktree add failed for ${spec.name}: ${add.stderr}`);
    }
    const markerAbs = join(worktree, spec.markerRelativePath);
    mkdirSync(dirname(markerAbs), { recursive: true });
    writeFileSync(markerAbs, spec.markerContents, "utf8");
    agents.push({
      name: spec.name,
      worktree,
      branch,
      marker: spec.markerRelativePath,
    });
  }

  // Main checkout must not contain those marker files
  const collidedOnMain = specs.some((s) => existsSync(join(repoRoot, s.markerRelativePath)));

  // Markers must exist inside their own worktrees and differ
  for (const a of agents) {
    const text = readFileSync(join(a.worktree, a.marker), "utf8");
    const spec = specs.find((s) => s.name === a.name)!;
    if (text !== spec.markerContents) {
      throw new Error(`marker mismatch in ${a.name}`);
    }
  }

  return { agents, collidedOnMain };
}

export function cleanupParallel(repoRoot: string, names: string[]): void {
  for (const name of names) {
    const worktree = join(repoRoot, ".wanwu", "worktrees", name);
    const branch = `wanwu/parallel-${name}`;
    spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: repoRoot });
    spawnSync("git", ["branch", "-D", branch], { cwd: repoRoot });
  }
}