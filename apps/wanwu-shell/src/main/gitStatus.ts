import { execFileSync } from "node:child_process";
import { parseGitPorcelain, type GitStatusEntry } from "../shared/scm.js";

export type { GitStatusCode, GitStatusEntry } from "../shared/scm.js";
export { parseGitPorcelain, scmCodeForPath } from "../shared/scm.js";

export function gitStatus(cwd: string): GitStatusEntry[] {
  try {
    const stdout = execFileSync("git", ["status", "--porcelain=v1"], {
      cwd,
      encoding: "utf8",
      timeout: 4000,
    });
    return parseGitPorcelain(stdout);
  } catch {
    return [];
  }
}
