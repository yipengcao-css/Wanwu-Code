import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Built-in skips. A workspace `.wanwuignore` or `~/.wanwu/ignore` can add more. */
export const DEFAULT_IGNORE = [
  "node_modules/",
  ".git/",
  "dist/",
  "out/",
  ".next/",
  "coverage/",
  "target/",
  ".wanwu/",
  ".env",
  ".env.*",
  "*.pem",
  "credentials.env",
].join("\n");

type Rule = { negate: boolean; dirOnly: boolean; re: RegExp };

function globToRegExp(pattern: string, anchored: boolean): RegExp {
  let src = "";
  const pat = pattern.replace(/\\/g, "/");
  for (let i = 0; i < pat.length; ) {
    if (pat[i] === "*" && pat[i + 1] === "*") {
      src += ".*";
      i += 2;
      if (pat[i] === "/") i += 1;
      continue;
    }
    if (pat[i] === "*") {
      src += "[^/]*";
      i += 1;
      continue;
    }
    const ch = pat[i]!;
    src += /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
    i += 1;
  }
  const body = anchored ? src : `(?:^|.*/)${src}`;
  return new RegExp(`^${body}$`);
}

export function compileIgnore(text: string): (rel: string, isDir: boolean) => boolean {
  const rules: Rule[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    let negate = false;
    if (line.startsWith("!")) {
      negate = true;
      line = line.slice(1).trim();
    }
    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    const anchored = line.startsWith("/");
    if (anchored) line = line.slice(1);
    if (!line) continue;
    rules.push({ negate, dirOnly, re: globToRegExp(line, anchored || line.includes("/")) });
  }
  return (rel: string, isDir: boolean) => {
    const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
    let ignored = false;
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) {
        const parts = norm.split("/");
        let matched = false;
        for (let i = 1; i < parts.length; i += 1) {
          if (rule.re.test(parts.slice(0, i).join("/"))) {
            matched = true;
            break;
          }
        }
        if (!matched) continue;
      } else if (!rule.re.test(norm)) {
        continue;
      }
      ignored = !rule.negate;
    }
    return ignored;
  };
}

export function loadIgnore(workspaceRoot: string): (rel: string, isDir: boolean) => boolean {
  const chunks = [DEFAULT_IGNORE];
  const user = join(homedir(), ".wanwu", "ignore");
  const local = join(workspaceRoot, ".wanwuignore");
  if (existsSync(user)) chunks.push(readFileSync(user, "utf8"));
  if (existsSync(local)) chunks.push(readFileSync(local, "utf8"));
  return compileIgnore(chunks.join("\n"));
}

/** True when a direct read of this workspace-relative path should be refused. */
export function isIgnoredPath(workspaceRoot: string, rel: string, isDir = false): boolean {
  const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (!norm || norm === ".") return false;
  return loadIgnore(workspaceRoot)(norm, isDir);
}
