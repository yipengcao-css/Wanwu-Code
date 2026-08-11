import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { PermissionMode } from "@wanwu/config";
import { assessBash } from "../permission.js";
import { PathSandboxError, assertInsideWorkspace, isDirectory } from "./workspacePaths.js";

export interface ToolResult {
  ok: boolean;
  title: string;
  text: string;
  diff?: { path: string; before: string; after: string };
}

function walkFiles(root: string, dir: string, out: string[], max = 500): void {
  if (out.length >= max) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === "out") continue;
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

function matchGlob(relPath: string, pattern: string): boolean {
  const path = relPath.replace(/\\/g, "/");
  const pat = pattern.replace(/\\/g, "/");
  // Escape regex specials except our glob tokens
  let reSrc = "";
  for (let i = 0; i < pat.length; ) {
    if (pat[i] === "*" && pat[i + 1] === "*") {
      reSrc += ".*";
      i += 2;
      if (pat[i] === "/") {
        // '**/' also matches zero directories
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
  return new RegExp(`^${reSrc}$`).test(path);
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

export function toolGlob(workspaceRoot: string, pattern: string): ToolResult {
  const files: string[] = [];
  walkFiles(workspaceRoot, workspaceRoot, files);
  const pat = pattern.trim() || "**/*";
  const hits = files.filter((f) => matchGlob(f.replace(/\\/g, "/"), pat.replace(/\\/g, "/")));
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
  const filtered = files.filter((f) =>
    matchGlob(f.replace(/\\/g, "/"), globPat.replace(/\\/g, "/")),
  );
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

export function toolEdit(
  workspaceRoot: string,
  pathArg: string,
  after: string,
  opts: { apply: boolean },
): ToolResult {
  try {
    const abs = assertInsideWorkspace(workspaceRoot, pathArg);
    const before = existsSync(abs) && !isDirectory(abs) ? readFileSync(abs, "utf8") : "";
    if (opts.apply) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, after, "utf8");
    }
    return {
      ok: true,
      title: "Edit",
      text: opts.apply ? `wrote ${pathArg}` : `proposed edit for ${pathArg}`,
      diff: { path: pathArg, before, after },
    };
  } catch (err) {
    return {
      ok: false,
      title: "Edit",
      text: err instanceof PathSandboxError ? err.message : String(err),
    };
  }
}

export function toolBash(
  workspaceRoot: string,
  command: string,
  permissionMode: PermissionMode,
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
  const result = spawnSync(command, {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: true,
    timeout: 60_000,
    env: process.env,
  });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const code = result.status ?? 1;
  return {
    ok: code === 0,
    title: "Bash",
    text: out || `(exit ${code})`,
  };
}
