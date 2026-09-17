import { ipcMain } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type GitStatusEntry = { path: string; index: string; workingTree: string };
export type GitStatus = { available: boolean; branch: string | null; entries: GitStatusEntry[] };

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", root, ...args], { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

async function status(root: string): Promise<GitStatus> {
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
      entries.push({
        index: line[0] ?? " ",
        workingTree: line[1] ?? " ",
        path: line.slice(3).trim(),
      });
    }
  } catch {
    /* ignore */
  }
  return { available: true, branch, entries };
}

export function registerGitIpc(getRoot: () => string | null): void {
  ipcMain.handle("git:status", async (): Promise<GitStatus> => {
    const root = getRoot();
    if (!root) return { available: false, branch: null, entries: [] };
    return status(root);
  });

  ipcMain.handle("git:commit", async (_e, message: string): Promise<{ ok: boolean; output: string }> => {
    const root = getRoot();
    if (!root) return { ok: false, output: "no workspace open" };
    if (!message.trim()) return { ok: false, output: "commit message required" };
    try {
      await git(root, ["add", "-A"]);
      const out = await git(root, ["commit", "-m", message.trim()]);
      return { ok: true, output: out.trim() };
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      return { ok: false, output: (e.stderr || e.stdout || e.message || "commit failed").trim() };
    }
  });
}
