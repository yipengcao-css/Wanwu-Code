export type ProblemSeverity = "error" | "warning" | "info" | "hint";

export type ProblemDiag = {
  path: string;
  message: string;
  severity: ProblemSeverity;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  source?: string;
};

const CHECKER_LINES = [
  /^(?<file>.+?)\((?<line>\d+),(?<col>\d+)\):\s*(?<sev>error|warning)\s+(?<code>\S+):\s*(?<msg>.*)$/,
  /^(?<file>.+?):(?<line>\d+):(?<col>\d+)\s+-\s+(?<sev>error|warning)\s+(?<code>\S+):\s*(?<msg>.*)$/,
  /^(?<file>.+?):(?<line>\d+):(?<col>\d+):\s*(?<sev>error|warning)(?:\[[^\]]+\])?:\s*(?<msg>.*)$/,
  /^(?<file>(?:\.{1,2}\/)?[^:\s][^:]*\.[A-Za-z0-9]+):(?<line>\d+):(?<col>\d+):\s*(?<msg>.+)$/,
];

function toRel(file: string, cwd: string): string | null {
  let rel = file.trim().replace(/\\/g, "/");
  if (rel.startsWith("./")) rel = rel.slice(2);
  const root = cwd.replace(/\\/g, "/").replace(/\/$/, "");
  if (root && (rel === root || rel.startsWith(`${root}/`))) {
    rel = rel.slice(root.length).replace(/^\//, "");
  }
  if (!rel || rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) return null;
  if (rel.split("/").some((part) => part === ".." || part === "node_modules")) return null;
  return rel;
}

function severityOf(raw: string | undefined, message: string): ProblemSeverity {
  if (raw?.toLowerCase() === "warning" || /\bwarning\b/i.test(message)) return "warning";
  return "error";
}

/** Turn tsc, cargo, go, and similar checker output into editor locations. */
export function parseCheckerOutput(text: string, cwd: string): ProblemDiag[] {
  const out: ProblemDiag[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    for (const re of CHECKER_LINES) {
      const m = re.exec(line);
      if (!m?.groups) continue;
      const path = toRel(m.groups.file ?? "", cwd);
      if (!path) break;
      const startLine = Math.max(0, Number(m.groups.line) - 1);
      const startCharacter = Math.max(0, Number(m.groups.col) - 1);
      const message = (m.groups.msg ?? "").trim();
      if (!message) break;
      const key = `${path}:${startLine}:${startCharacter}:${message}`;
      if (seen.has(key)) break;
      seen.add(key);
      out.push({
        path,
        message,
        severity: severityOf(m.groups.sev, message),
        startLine,
        startCharacter,
        endLine: startLine,
        endCharacter: startCharacter + 1,
        source: m.groups.code,
      });
      break;
    }
  }
  return out;
}

/**
 * Open-file diagnostics replace the scan for that path.
 * An empty list means the language service already checked the file.
 */
export function mergeDiagnostics<T>(
  live: Record<string, T[]>,
  scanned: Record<string, T[]>,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const [path, rows] of Object.entries(scanned)) {
    if (rows.length) out[path] = rows;
  }
  for (const [path, rows] of Object.entries(live)) {
    if (rows.length) out[path] = rows;
    else delete out[path];
  }
  return out;
}
