import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";

export type PermissionRuleAction = "allow" | "ask" | "deny";

export interface PermissionRule {
  action: PermissionRuleAction;
  pattern: string;
  reason?: string;
}

export interface PermissionsFile {
  rules: PermissionRule[];
  source?: string;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asAction(v: unknown): PermissionRuleAction | undefined {
  if (v === "allow" || v === "ask" || v === "deny") return v;
  return undefined;
}

/**
 * Load `.wanwu/permissions.toml`:
 *
 * ```toml
 * [[rules]]
 * action = "deny"
 * pattern = "rm -rf /*"
 * reason = "destructive"
 *
 * [[rules]]
 * action = "ask"
 * pattern = "git push*"
 * ```
 */
export function loadPermissionsFile(cwd: string): PermissionsFile {
  const path = join(cwd, ".wanwu", "permissions.toml");
  if (!existsSync(path)) return { rules: [] };
  const parsed = parseToml(readFileSync(path, "utf8")) as { rules?: unknown };
  const raw = Array.isArray(parsed.rules) ? parsed.rules : [];
  const rules: PermissionRule[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const obj = r as Record<string, unknown>;
    const action = asAction(obj.action);
    const pattern = asString(obj.pattern);
    if (!action || !pattern) continue;
    rules.push({ action, pattern, reason: asString(obj.reason) });
  }
  return { rules, source: path };
}

/** Simple glob-to-regex for permission patterns. */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withWildcards = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${withWildcards}$`, "i");
}

export function matchPermissionRule(
  file: PermissionsFile,
  toolName: string,
  input: string,
): PermissionRule | undefined {
  const target = `${toolName} ${input}`.trim();
  for (const rule of file.rules) {
    if (patternToRegex(rule.pattern).test(target)) {
      return rule;
    }
  }
  return undefined;
}
