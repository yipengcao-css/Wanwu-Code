import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitStatus, GitStatusEntry } from "../shared/ipc.js";

const run = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", root, ...args], { maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

export async function gitStatus(root: string | null): Promise<GitStatus> {
  if (!root) return { available: false, branch: null, entries: [] };
  try {
    await git(root, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return { available: false, branch: null, entries: [] };
  }

  let branch: string | null = null;
  try {
    branch = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim() || null;
  } catch {
    branch = null;
  }

  const entries: GitStatusEntry[] = [];
  try {
    const out = await git(root, ["status", "--porcelain=v1"]);
    for (const line of out.split("\n")) {
      if (line.length < 4) continue;
      const index = line[0] ?? " ";
      const workingTree = line[1] ?? " ";
      const path = line.slice(3).trim();
      entries.push({ path, index, workingTree });
    }
  } catch {
    /* ignore */
  }

  return { available: true, branch, entries };
}
