import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseGitPorcelain, type GitStatusEntry } from "../shared/scm.js";

export type { GitStatusCode, GitStatusEntry } from "../shared/scm.js";
export { parseGitPorcelain, scmCodeForPath } from "../shared/scm.js";

export function gitStatus(cwd: string): GitStatusEntry[] {
  if (!cwd || !existsSync(path.join(cwd, ".git"))) return [];
  try {
    const stdout = execFileSync("git", ["status", "--porcelain=v1"], {
      cwd,
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true,
      // Explicit pipes: Sync git writes "fatal: not a git repository" to the terminal otherwise.
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parseGitPorcelain(stdout);
  } catch {
    return [];
  }
}
