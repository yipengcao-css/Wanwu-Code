import { execFileSync } from "node:child_process";

export type GitStatusCode = "M" | "A" | "D" | "?" | "U" | "R" | "C";

export type GitStatusEntry = {
  path: string;
  /** XY porcelain: first non-space of index/worktree, collapsed. */
  code: GitStatusCode;
  raw: string;
};

export function parseGitPorcelain(stdout: string): GitStatusEntry[] {
  const out: GitStatusEntry[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.length < 4) continue;
    const raw = line.slice(0, 2);
    const rest = line.slice(3);
    const path = rest.includes(" -> ") ? rest.slice(rest.lastIndexOf(" -> ") + 4) : rest;
    const letter = (raw[1] !== " " && raw[1] !== "?" ? raw[1] : raw[0]) ?? "?";
    const code = (letter === "?" ? "?" : letter) as GitStatusCode;
    out.push({ path: path.trim().replace(/\\/g, "/"), code, raw });
  }
  return out;
}

export function gitStatus(cwd: string): GitStatusEntry[] {
  try {
    // Line-oriented porcelain is enough for UI/tools; -z is harder to parse for renames.
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
