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
    out.push({ path: path.trim(), code, raw });
  }
  return out;
}

export function gitStatus(cwd: string): GitStatusEntry[] {
  try {
    const stdout = execFileSync("git", ["status", "--porcelain=v1", "-z"], {
      cwd,
      encoding: "utf8",
      timeout: 4000,
    });
    // -z uses NUL. Fall back to line parse if empty separators look like newlines.
    if (stdout.includes("\0")) {
      return parseGitPorcelain(
        stdout
          .split("\0")
          .filter(Boolean)
          .map((row) => (row.length >= 3 ? `${row.slice(0, 2)} ${row.slice(3)}` : row))
          .join("\n"),
      );
    }
    return parseGitPorcelain(stdout);
  } catch {
    return [];
  }
}
