import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { PermissionMode, SandboxMode } from "@wanwu/config";
import { assessBash } from "../permission.js";
import { runSandboxed } from "./sandbox/runSandboxed.js";
import { PathSandboxError, assertInsideWorkspace, isDirectory } from "./workspacePaths.js";

export interface ToolResult {
  ok: boolean;
  title: string;
  text: string;
  diff?: { path: string; before: string; after: string };
  /** True when the edit was persisted to disk (false = propose-only). */
  applied?: boolean;
}

export interface EditBlock {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

const WALK_MAX = 500;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "out", ".next", "coverage", "target"]);

function walkFiles(root: string, dir: string, out: string[], max = WALK_MAX): void {
  if (out.length >= max) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(root, full, out, max);
    } else if (st.isFile()) {
      out.push(relative(root, full) || name);
      if (out.length >= max) return;
    }
  }
}

const globCache = new Map<string, RegExp>();

function globToRegExp(pattern: string): RegExp {
  const cached = globCache.get(pattern);
  if (cached) return cached;
  const pat = pattern.replace(/\\/g, "/");
  let reSrc = "";
  for (let i = 0; i < pat.length; ) {
    if (pat[i] === "*" && pat[i + 1] === "*") {
      reSrc += ".*";
      i += 2;
      if (pat[i] === "/") {
        i += 1;
      }
      continue;
    }
    if (pat[i] === "*") {
      reSrc += "[^/]*";
      i += 1;
      continue;
    }
    if (pat[i] === "?") {
      reSrc += "[^/]";
      i += 1;
      continue;
    }
    const ch = pat[i]!;
    if (/[.+^${}()|[\]\\]/.test(ch)) reSrc += `\\${ch}`;
    else reSrc += ch;
    i += 1;
  }
  const re = new RegExp(`^${reSrc}$`);
  if (globCache.size > 200) globCache.clear();
  globCache.set(pattern, re);
  return re;
}

function matchGlob(relPath: string, pattern: string): boolean {
  const path = relPath.replace(/\\/g, "/");
  return globToRegExp(pattern).test(path);
}

export function toolRead(workspaceRoot: string, pathArg: string): ToolResult {
  try {
    const abs = assertInsideWorkspace(workspaceRoot, pathArg);
    if (!existsSync(abs) || isDirectory(abs)) {
      return { ok: false, title: "Read", text: `not a file: ${pathArg}` };
    }
    const text = readFileSync(abs, "utf8");
    const clipped = text.length > 80_000 ? `${text.slice(0, 80_000)}\n…(truncated)` : text;
    return { ok: true, title: "Read", text: clipped };
  } catch (err) {
    return {
      ok: false,
      title: "Read",
      text: err instanceof PathSandboxError ? err.message : String(err),
    };
  }
}

/** List workspace files (walk caps apply) — used by TUI @-completion. */
export function listWorkspaceFiles(workspaceRoot: string, max = WALK_MAX): string[] {
  const files: string[] = [];
  walkFiles(workspaceRoot, workspaceRoot, files, max);
  return files;
}

export function toolGlob(workspaceRoot: string, pattern: string): ToolResult {
  const files: string[] = [];
  walkFiles(workspaceRoot, workspaceRoot, files);
  const pat = pattern.trim() || "**/*";
  const hits = files.filter((f) => matchGlob(f, pat));
  return {
    ok: true,
    title: "Glob",
    text: hits.length ? hits.slice(0, 200).join("\n") : "(no matches)",
  };
}

export function toolGrep(workspaceRoot: string, pattern: string, globPat = "**/*"): ToolResult {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    return { ok: false, title: "Grep", text: `invalid regexp: ${pattern}` };
  }
  const files: string[] = [];
  walkFiles(workspaceRoot, workspaceRoot, files);
  const filtered = files.filter((f) => matchGlob(f, globPat));
  const lines: string[] = [];
  for (const rel of filtered.slice(0, 200)) {
    try {
      const abs = assertInsideWorkspace(workspaceRoot, rel);
      const content = readFileSync(abs, "utf8");
      content.split(/\r?\n/).forEach((line, i) => {
        if (re.test(line) && lines.length < 80) {
          lines.push(`${rel}:${i + 1}:${line.slice(0, 200)}`);
        }
      });
    } catch {
      /* skip */
    }
    if (lines.length >= 80) break;
  }
  return {
    ok: true,
    title: "Grep",
    text: lines.length ? lines.join("\n") : "(no matches)",
  };
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    idx = haystack.indexOf(needle, idx);
    if (idx === -1) return count;
    count += 1;
    idx += needle.length;
  }
}

/** Normalize line trailing whitespace — tolerant fallback for exact match. */
function normalizeLineEndings(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n");
}

/**
 * Find a match for `oldString` in `content`.
 * 1) exact match; 2) fallback: match after trimming trailing whitespace per line
 *    (returns the original-text span so replacement preserves file content).
 */
export function findEditMatch(
  content: string,
  oldString: string,
): { start: number; end: number; matched: string } | undefined {
  const exact = content.indexOf(oldString);
  if (exact !== -1) {
    return { start: exact, end: exact + oldString.length, matched: oldString };
  }
  // Tolerant pass: align normalized lines back to original offsets.
  const contentLines = content.split("\n");
  const oldLines = normalizeLineEndings(oldString).split("\n");
  if (!oldLines.length || oldLines.length > contentLines.length) return undefined;
  const normContent = contentLines.map((l) => l.replace(/[ \t]+$/g, ""));
  outer: for (let i = 0; i + oldLines.length <= contentLines.length; i += 1) {
    for (let j = 0; j < oldLines.length; j += 1) {
      if (normContent[i + j] !== oldLines[j]) continue outer;
    }
    // Compute original offsets for line range [i, i + oldLines.length)
    let start = 0;
    for (let k = 0; k < i; k += 1) start += contentLines[k]!.length + 1;
    let end = start;
    for (let k = i; k < i + oldLines.length; k += 1) {
      end += contentLines[k]!.length;
      if (k < i + oldLines.length - 1) end += 1;
    }
    return { start, end, matched: content.slice(start, end) };
  }
  return undefined;
}

/** Best-effort context snippet when a block fails to match. */
function nearMissHint(content: string, oldString: string): string {
  const firstLine = oldString.split("\n").find((l) => l.trim().length > 0) ?? "";
  if (!firstLine) return "";
  const trimmed = firstLine.trim();
  const lines = content.split("\n");
  // Try full line, then shrinking prefixes, to locate the closest region.
  let idx = -1;
  for (const len of [40, 24, 12]) {
    const key = trimmed.slice(0, len);
    if (!key) continue;
    idx = lines.findIndex((l) => l.includes(key));
    if (idx !== -1) break;
  }
  if (idx === -1) return "";
  const from = Math.max(0, idx - 2);
  const to = Math.min(lines.length, idx + 3);
  const snippet = lines
    .slice(from, to)
    .map((l, i) => `${from + i + 1}: ${l}`)
    .join("\n");
  return `\nNear miss around line ${idx + 1}:\n${snippet}`;
}

export interface EditApplyResult {
  ok: boolean;
  after: string;
  replacements: number;
  error?: string;
}

/** Apply search/replace blocks sequentially. Pure — no IO. */
export function applyEditBlocks(content: string, blocks: EditBlock[]): EditApplyResult {
  let current = content;
  let replacements = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (typeof block.old_string !== "string" || typeof block.new_string !== "string") {
      return { ok: false, after: content, replacements, error: `block ${i + 1}: old_string/new_string must be strings` };
    }
    if (block.old_string === "") {
      return { ok: false, after: content, replacements, error: `block ${i + 1}: old_string must not be empty (use Write to create files)` };
    }
    if (block.old_string === block.new_string) {
      return { ok: false, after: content, replacements, error: `block ${i + 1}: old_string and new_string are identical` };
    }
    if (block.replace_all) {
      const n = countOccurrences(current, block.old_string);
      if (n === 0) {
        return {
          ok: false,
          after: content,
          replacements,
          error: `block ${i + 1}: old_string not found${nearMissHint(current, block.old_string)}`,
        };
      }
      current = current.split(block.old_string).join(block.new_string);
      replacements += n;
      continue;
    }
    const exactCount = countOccurrences(current, block.old_string);
    if (exactCount > 1) {
      return {
        ok: false,
        after: content,
        replacements,
        error: `block ${i + 1}: old_string matches ${exactCount} times — add more context or set replace_all`,
      };
    }
    const match = findEditMatch(current, block.old_string);
    if (!match) {
      return {
        ok: false,
        after: content,
        replacements,
        error: `block ${i + 1}: old_string not found${nearMissHint(current, block.old_string)}`,
      };
    }
    current = current.slice(0, match.start) + block.new_string + current.slice(match.end);
    replacements += 1;
  }
  return { ok: true, after: current, replacements };
}

/** Targeted edits to an existing file via search/replace blocks. */
export function toolEdit(
  workspaceRoot: string,
  pathArg: string,
  blocks: EditBlock[],
  opts: { apply: boolean },
): ToolResult {
  try {
    const abs = assertInsideWorkspace(workspaceRoot, pathArg);
    if (!existsSync(abs) || isDirectory(abs)) {
      return { ok: false, title: "Edit", text: `file does not exist: ${pathArg} (use Write to create it)`, applied: false };
    }
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return { ok: false, title: "Edit", text: "edits must be a non-empty array of {old_string, new_string}", applied: false };
    }
    const before = readFileSync(abs, "utf8");
    const result = applyEditBlocks(before, blocks);
    if (!result.ok) {
      return { ok: false, title: "Edit", text: result.error ?? "edit failed", applied: false };
    }
    if (opts.apply) {
      writeFileSync(abs, result.after, "utf8");
    }
    return {
      ok: true,
      title: "Edit",
      text: `${opts.apply ? "applied" : "proposed"} ${result.replacements} replacement(s) in ${pathArg}`,
      diff: { path: pathArg, before, after: result.after },
      applied: opts.apply,
    };
  } catch (err) {
    return {
      ok: false,
      title: "Edit",
      text: err instanceof PathSandboxError ? err.message : String(err),
      applied: false,
    };
  }
}

/** Create a new file or overwrite an existing file entirely. */
export function toolWrite(
  workspaceRoot: string,
  pathArg: string,
  content: string,
  opts: { apply: boolean },
): ToolResult {
  try {
    const abs = assertInsideWorkspace(workspaceRoot, pathArg);
    const before = existsSync(abs) && !isDirectory(abs) ? readFileSync(abs, "utf8") : "";
    if (opts.apply) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
    }
    return {
      ok: true,
      title: "Write",
      text: `${opts.apply ? "wrote" : "proposed write for"} ${pathArg} (${content.length} chars)`,
      diff: { path: pathArg, before, after: content },
      applied: opts.apply,
    };
  } catch (err) {
    return {
      ok: false,
      title: "Write",
      text: err instanceof PathSandboxError ? err.message : String(err),
      applied: false,
    };
  }
}

const SECRET_ENV_PATTERN =
  /(_API_KEY|_API_SECRET|_TOKEN|_SECRET|_PASSWORD|_PRIVATE_KEY|AWS_SECRET|CREDENTIALS)$/i;

/** Strip obvious credential env vars before spawning Bash. */
export function minimalBashEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    if (SECRET_ENV_PATTERN.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export function toolBash(
  workspaceRoot: string,
  command: string,
  permissionMode: PermissionMode,
  sandbox: SandboxMode = "workspace",
): ToolResult {
  const verdict = assessBash(command, permissionMode);
  if (!verdict.allow) {
    return {
      ok: false,
      title: "Bash",
      text: `Blocked by permission: ${verdict.reason}${
        verdict.requiresPrompt ? " (requires confirmation)" : ""
      }`,
    };
  }
  const env =
    process.env.WANWU_BASH_ENV === "full" ? process.env : minimalBashEnv();
  const result = runSandboxed({
    workspaceRoot,
    command,
    mode: sandbox,
    env,
    timeout: 60_000,
  });
  if (result.error) {
    return {
      ok: false,
      title: "Bash",
      text: `Sandbox error: ${result.error}`,
    };
  }
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const code = result.status ?? 1;
  return {
    ok: code === 0,
    title: "Bash",
    text: out || `(exit ${code})`,
  };
}
