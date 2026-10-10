import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type ScmFile = {
  path: string;
  code: string;
  staged: boolean;
};

function runGit(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, stdout, stderr: "" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: (e.stderr || e.message || "git failed").toString(),
    };
  }
}

export function safeRepoPath(rel: string): string | null {
  const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!norm || norm.startsWith("/") || /^[A-Za-z]:/.test(norm)) return null;
  if (norm.split("/").includes("..")) return null;
  return norm;
}

export function gitIsRepo(cwd: string): boolean {
  if (!cwd) return false;
  const r = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return r.ok && r.stdout.trim() === "true";
}

export function gitScmStatus(cwd: string): { repo: boolean; files: ScmFile[] } {
  if (!gitIsRepo(cwd)) return { repo: false, files: [] };
  const r = runGit(cwd, ["status", "--porcelain=v1"]);
  if (!r.ok && !r.stdout) return { repo: true, files: [] };
  const files: ScmFile[] = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.length < 4) continue;
    const raw = line.slice(0, 2);
    const rest = line.slice(3);
    const file = rest.includes(" -> ") ? rest.slice(rest.lastIndexOf(" -> ") + 4) : rest;
    const rel = safeRepoPath(file.trim());
    if (!rel) continue;
    const letter = (raw[1] !== " " && raw[1] !== "?" ? raw[1] : raw[0]) ?? "?";
    files.push({
      path: rel,
      code: letter === "?" ? "?" : letter,
      staged: raw[0] !== " " && raw[0] !== "?",
    });
  }
  return { repo: true, files };
}

function untrackedDiff(cwd: string, rel: string): string {
  const abs = path.join(cwd, ...rel.split("/"));
  if (!existsSync(abs)) return "";
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return "";
  }
  if (text.includes("\0")) return "（二进制文件，没有文本差异）";
  const lines = text.split(/\r?\n/);
  const shown = lines.slice(0, 200);
  const more = lines.length > 200 ? "\n…（只显示前 200 行）" : "";
  return `--- 新文件 ---\n${shown.map((line) => `+${line}`).join("\n")}${more}`;
}

export function gitDiff(cwd: string, rel: string): string {
  const safe = safeRepoPath(rel);
  if (!safe || !gitIsRepo(cwd)) return "";
  const unstaged = runGit(cwd, ["diff", "--no-color", "--", safe]);
  const staged = runGit(cwd, ["diff", "--cached", "--no-color", "--", safe]);
  const parts = [
    staged.stdout && `--- 已暂存 ---\n${staged.stdout}`,
    unstaged.stdout && `--- 未暂存 ---\n${unstaged.stdout}`,
  ].filter(Boolean);
  if (parts.length) return parts.join("\n");
  const status = runGit(cwd, ["status", "--porcelain=v1", "--", safe]);
  const line = status.stdout.split(/\r?\n/).find((row) => row.trim());
  if (!line?.startsWith("??")) return "";
  return untrackedDiff(cwd, safe);
}

export function gitStage(cwd: string, rels: string[], staged: boolean): { ok: boolean; text: string } {
  const paths = rels.map(safeRepoPath).filter((p): p is string => Boolean(p));
  if (!paths.length) return { ok: false, text: "没有可暂存的路径" };
  if (!gitIsRepo(cwd)) return { ok: false, text: "当前文件夹不是 Git 仓库" };
  const args = staged ? ["add", "--", ...paths] : ["restore", "--staged", "--", ...paths];
  const r = runGit(cwd, args);
  return { ok: r.ok, text: r.ok ? (staged ? "已暂存" : "已取消暂存") : r.stderr.slice(0, 400) };
}

export function gitBranch(cwd: string): string {
  if (!gitIsRepo(cwd)) return "";
  const r = runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return r.ok ? r.stdout.trim() : "";
}

export type GitLogEntry = { hash: string; subject: string };

export function gitFileLog(cwd: string, rel: string, limit = 5): GitLogEntry[] {
  const safe = safeRepoPath(rel);
  if (!safe || !gitIsRepo(cwd)) return [];
  const n = Math.min(20, Math.max(1, Math.floor(limit)));
  const r = runGit(cwd, ["log", "-n", String(n), "--pretty=format:%h%x09%s", "--", safe]);
  if (!r.stdout.trim()) return [];
  return r.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      if (tab < 0) return { hash: line.slice(0, 12), subject: line };
      return { hash: line.slice(0, tab), subject: line.slice(tab + 1) };
    });
}

export function gitBlameLine(cwd: string, rel: string, line: number): { text: string } {
  const safe = safeRepoPath(rel);
  const n = Math.floor(line);
  if (!safe || n < 1 || !gitIsRepo(cwd)) return { text: "" };
  const r = runGit(cwd, ["blame", "-L", `${n},${n}`, "--porcelain", "--", safe]);
  if (!r.ok || !r.stdout.trim()) return { text: "这一行还没有提交记录" };
  const first = r.stdout.split(/\r?\n/)[0] ?? "";
  const full = first.split(" ")[0] ?? "";
  if (!full || /^0+$/.test(full)) return { text: "这一行还没有提交记录" };
  let author = "";
  let summary = "";
  for (const row of r.stdout.split(/\r?\n/)) {
    if (row.startsWith("author ")) author = row.slice("author ".length).trim();
    else if (row.startsWith("summary ")) summary = row.slice("summary ".length).trim();
  }
  const short = full.slice(0, 7);
  const parts = [short, author, summary].filter(Boolean);
  return { text: parts.join(" · ") };
}

export function gitCommit(cwd: string, message: string): { ok: boolean; text: string } {
  const msg = message.trim();
  if (!msg) return { ok: false, text: "请先写提交说明" };
  if (!gitIsRepo(cwd)) return { ok: false, text: "当前文件夹不是 Git 仓库" };
  if (!existsSync(path.join(cwd, ".git")) && !gitIsRepo(cwd)) {
    return { ok: false, text: "当前文件夹不是 Git 仓库" };
  }
  const staged = runGit(cwd, ["diff", "--cached", "--name-only"]);
  if (!staged.stdout.trim()) return { ok: false, text: "没有已暂存的更改。请先勾选要提交的文件。" };
  const r = runGit(cwd, ["commit", "-m", msg]);
  const text = (r.stdout || r.stderr).trim().slice(0, 500);
  return { ok: r.ok, text: text || (r.ok ? "已提交" : "提交失败") };
}
