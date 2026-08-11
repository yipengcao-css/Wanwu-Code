import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parse as parseToml } from "smol-toml";

export type HookEvent = "PreToolUse" | "PostToolUse" | "Stop";

export interface HookDef {
  event: HookEvent;
  command: string;
}

export function loadHooks(cwd: string): HookDef[] {
  const file = join(cwd, ".wanwu", "hooks.toml");
  if (!existsSync(file)) {
    // also discover executable scripts named PreToolUse* under hooks/
    const dir = join(cwd, ".wanwu", "hooks");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((n) => n.endsWith(".sh"))
      .map((n) => ({
        event: "PostToolUse" as const,
        command: join(dir, n),
      }));
  }
  const parsed = parseToml(readFileSync(file, "utf8")) as { hooks?: unknown };
  const hooks = Array.isArray(parsed.hooks) ? parsed.hooks : [];
  return hooks
    .map((h) => h as Record<string, unknown>)
    .filter((h) => typeof h.event === "string" && typeof h.command === "string")
    .map((h) => ({ event: h.event as HookEvent, command: String(h.command) }));
}

export function runHooks(cwd: string, event: HookEvent): { ok: boolean; outputs: string[] } {
  const hooks = loadHooks(cwd).filter((h) => h.event === event);
  const outputs: string[] = [];
  for (const h of hooks) {
    const result = spawnSync("bash", ["-lc", h.command], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, WANWU_HOOK_EVENT: event },
    });
    const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (text) outputs.push(text);
    if ((result.status ?? 1) !== 0) {
      return { ok: false, outputs };
    }
  }
  return { ok: true, outputs };
}