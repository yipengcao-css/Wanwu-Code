import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type RuleRow = { name: string; scope: "user" | "workspace"; body: string };
export type MemoryRow = { index: number; text: string };

const NAME = /^[\w.-]+$/;

function ruleDir(workspaceRoot: string, scope: RuleRow["scope"]): string {
  return scope === "user"
    ? path.join(homedir(), ".wanwu", "rules")
    : path.join(workspaceRoot, ".wanwu", "rules");
}

function readRules(dir: string, scope: RuleRow["scope"]): RuleRow[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .map((name) => ({
      name: name.replace(/\.md$/i, ""),
      scope,
      body: readFileSync(path.join(dir, name), "utf8"),
    }));
}

export function listRules(workspaceRoot: string): RuleRow[] {
  return [...readRules(ruleDir(workspaceRoot, "user"), "user"), ...readRules(ruleDir(workspaceRoot, "workspace"), "workspace")];
}

export function writeRule(
  workspaceRoot: string,
  name: string,
  body: string,
  scope: RuleRow["scope"],
): void {
  if (!NAME.test(name)) throw new Error("规则名只能包含字母、数字、点、下划线和短横线");
  const dir = ruleDir(workspaceRoot, scope);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.md`), body, "utf8");
}

export function deleteRule(workspaceRoot: string, name: string, scope: RuleRow["scope"]): boolean {
  if (!NAME.test(name)) return false;
  const file = path.join(ruleDir(workspaceRoot, scope), `${name}.md`);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}

function learnedRange(text: string): { start: number; end: number } | null {
  const start = text.search(/^## Learned\s*$/m);
  if (start < 0) return null;
  const rest = text.slice(start + 1);
  const next = rest.search(/\n## /);
  const end = next < 0 ? text.length : start + 1 + next;
  return { start, end };
}

export function listMemories(workspaceRoot: string): MemoryRow[] {
  const file = path.join(workspaceRoot, "WANWU.md");
  if (!existsSync(file)) return [];
  const range = learnedRange(readFileSync(file, "utf8"));
  if (!range) return [];
  const body = readFileSync(file, "utf8").slice(range.start, range.end);
  const rows: MemoryRow[] = [];
  let index = 0;
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("- ")) continue;
    rows.push({ index, text: line.slice(2).trim() });
    index += 1;
  }
  return rows;
}

export function deleteMemory(workspaceRoot: string, index: number): boolean {
  const file = path.join(workspaceRoot, "WANWU.md");
  if (!existsSync(file) || index < 0) return false;
  const text = readFileSync(file, "utf8");
  const range = learnedRange(text);
  if (!range) return false;
  const lines = text.slice(range.start, range.end).split(/\r?\n/);
  let seen = 0;
  let removed = false;
  const nextLines = lines.filter((line) => {
    if (!line.startsWith("- ")) return true;
    if (seen === index) {
      seen += 1;
      removed = true;
      return false;
    }
    seen += 1;
    return true;
  });
  if (!removed) return false;
  const next = text.slice(0, range.start) + nextLines.join("\n") + text.slice(range.end);
  writeFileSync(file, next, "utf8");
  return true;
}
