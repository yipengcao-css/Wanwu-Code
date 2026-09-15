import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

/**
 * Layered rules (Cursor .cursor/rules equivalent):
 *   ~/.wanwu/rules/*.md        user scope
 *   <workspace>/.wanwu/rules/*.md   project scope (wins on name conflict)
 *
 * Frontmatter:
 *   ---
 *   description: React hooks rules
 *   globs: src/**\/*.tsx, **\/*.jsx
 *   alwaysApply: true
 *   ---
 */

export interface RuleFile {
  /** Rule name (file basename without .md). */
  name: string;
  path: string;
  scope: "user" | "workspace";
  description?: string;
  /** Glob patterns; rule activates when a touched file matches. */
  globs: string[];
  alwaysApply: boolean;
  body: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (kv) meta[kv[1]!] = kv[2]!.trim();
  }
  return { meta, body: m[2] ?? "" };
}

function parseGlobs(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((g) => g.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function loadRuleFile(path: string, scope: RuleFile["scope"]): RuleFile | undefined {
  try {
    const { meta, body } = parseFrontmatter(readFileSync(path, "utf8"));
    return {
      name: basename(path).replace(/\.md$/i, ""),
      path,
      scope,
      description: meta.description || undefined,
      globs: parseGlobs(meta.globs),
      alwaysApply: meta.alwaysApply === "true" || meta.always === "true",
      body: body.trim(),
    };
  } catch {
    return undefined;
  }
}

function listRuleDir(dir: string, scope: RuleFile["scope"], out: Map<string, RuleFile>): void {
  if (!existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".md")) continue;
    const rule = loadRuleFile(join(dir, name), scope);
    // Later scopes (workspace) overwrite same-named user rules.
    if (rule) out.set(rule.name, rule);
  }
}

/** Discover rules: user scope first, workspace scope overrides by name. */
export function discoverRules(workspaceRoot: string): RuleFile[] {
  const out = new Map<string, RuleFile>();
  listRuleDir(join(homedir(), ".wanwu", "rules"), "user", out);
  listRuleDir(join(workspaceRoot, ".wanwu", "rules"), "workspace", out);
  return [...out.values()];
}

function globToRegExp(pattern: string): RegExp {
  const pat = pattern.replace(/\\/g, "/");
  let reSrc = "";
  for (let i = 0; i < pat.length; ) {
    if (pat[i] === "*" && pat[i + 1] === "*") {
      reSrc += ".*";
      i += 2;
      if (pat[i] === "/") i += 1;
      continue;
    }
    if (pat[i] === "*") {
      reSrc += "[^/]*";
      i += 1;
      continue;
    }
    const ch = pat[i]!;
    reSrc += /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
    i += 1;
  }
  return new RegExp(`^${reSrc}$`);
}

export function ruleMatchesFiles(rule: RuleFile, files: string[]): boolean {
  if (rule.alwaysApply) return true;
  if (!rule.globs.length || !files.length) return false;
  return rule.globs.some((g) => {
    const re = globToRegExp(g);
    return files.some((f) => re.test(f.replace(/\\/g, "/")));
  });
}

/**
 * Render rules for the system prompt.
 * - alwaysApply rules: full body
 * - glob rules matching activeFiles: full body
 * - others: name + description only (agent can Read the file on demand)
 */
export function renderRulesForPrompt(rules: RuleFile[], activeFiles: string[] = []): string {
  const active: string[] = [];
  const available: string[] = [];
  for (const r of rules) {
    if (ruleMatchesFiles(r, activeFiles)) {
      active.push(`### ${r.name} (${r.scope})\n${r.body}`);
    } else {
      available.push(`- ${r.name}${r.description ? `: ${r.description}` : ""} (${r.path})`);
    }
  }
  const parts: string[] = [];
  if (active.length) parts.push(`Active rules:\n\n${active.join("\n\n")}`);
  if (available.length) {
    parts.push(`Available rules (Read on demand):\n${available.join("\n")}`);
  }
  return parts.join("\n\n");
}
