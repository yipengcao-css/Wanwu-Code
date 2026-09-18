export type GitStatusCode = "M" | "A" | "D" | "?" | "U" | "R" | "C" | "dirty";

export type GitStatusEntry = {
  path: string;
  code: Exclude<GitStatusCode, "dirty">;
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
    const code = (letter === "?" ? "?" : letter) as Exclude<GitStatusCode, "dirty">;
    out.push({ path: path.trim().replace(/\\/g, "/"), code, raw });
  }
  return out;
}

export function scmCodeForPath(relPath: string, entries: GitStatusEntry[]): GitStatusCode | undefined {
  const norm = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const exact = entries.find((e) => e.path === norm);
  if (exact) return exact.code;
  const prefix = norm.endsWith("/") ? norm : `${norm}/`;
  if (entries.some((e) => e.path.startsWith(prefix))) return "dirty";
  return undefined;
}
