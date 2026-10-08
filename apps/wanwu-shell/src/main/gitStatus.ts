import { execFileSync } from "node:child_process";
import { parseGitPorcelain, type GitStatusEntry } from "../shared/scm.js";

export type { GitStatusCode, GitStatusEntry } from "../shared/scm.js";
export { parseGitPorcelain, scmCodeForPath } from "../shared/scm.js";

export function gitStatus(cwd: string): GitStatusEntry[] {
  if (!cwd) return [];
  try {
    const stdout = execFileSync("git", ["status", "--porcelain=v1"], {
      cwd,
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true,
      // Sync git prints "fatal: not a git repository" to the terminal unless stderr is piped.
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parseGitPorcelain(stdout);
  } catch {
    return [];
  }
}
