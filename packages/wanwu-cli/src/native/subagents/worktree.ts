import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface WorktreeHandle {
  path: string;
  branch: string;
  cleanup: () => void;
}

/**
 * Create an isolated git worktree for a subagent.
 * Falls back to workspaceRoot when git/worktree unavailable.
 */
export function createSubagentWorktree(
  workspaceRoot: string,
  id: string,
): WorktreeHandle {
  const branch = `wanwu/subagent-${id}`;
  const wt = join(workspaceRoot, ".wanwu", "subagent-worktrees", id);
  mkdirSync(join(workspaceRoot, ".wanwu", "subagent-worktrees"), { recursive: true });

  if (!existsSync(wt)) {
    const result = spawnSync("git", ["worktree", "add", "-b", branch, wt, "HEAD"], {
      cwd: workspaceRoot,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      // Fallback: use workspace root directly (no isolation)
      return {
        path: workspaceRoot,
        branch: "",
        cleanup: () => undefined,
      };
    }
  }

  return {
    path: wt,
    branch,
    cleanup: () => {
      spawnSync("git", ["worktree", "remove", "--force", wt], { cwd: workspaceRoot });
      spawnSync("git", ["branch", "-D", branch], { cwd: workspaceRoot });
    },
  };
}
