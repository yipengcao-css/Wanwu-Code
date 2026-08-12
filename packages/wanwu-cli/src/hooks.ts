import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parse as parseToml } from "smol-toml";

export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "ToolCallApproved"
  | "ToolCallDenied"
  | "SubagentStart"
  | "SubagentEnd"
  | "Error";

export interface HookDef {
  event: HookEvent;
  command: string;
}

export interface HookContext {
  toolName?: string;
  toolArgs?: string;
  sessionId?: string;
  sessionSource?: "new" | "load";
  prompt?: string;
  mode?: string;
  permissionChoice?: string;
  denyReason?: string;
  subagentId?: string;
  subagentKind?: string;
  subagentName?: string;
  subagentOk?: boolean;
  errorMessage?: string;
  errorSource?: string;
  stopReason?: string;
}

const KNOWN_EVENTS = new Set<string>([
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "ToolCallApproved",
  "ToolCallDenied",
  "SubagentStart",
  "SubagentEnd",
  "Error",
]);

export function loadHooks(cwd: string): HookDef[] {
  const file = join(cwd, ".wanwu", "hooks.toml");
  if (!existsSync(file)) {
    // also discover executable scripts under hooks/ named by event prefix
    const dir = join(cwd, ".wanwu", "hooks");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((n) => n.endsWith(".sh"))
      .map((n) => {
        const event = [...KNOWN_EVENTS].find((e) => n.startsWith(e));
        return event ? { event: event as HookEvent, command: join(dir, n) } : undefined;
      })
      .filter((h): h is HookDef => Boolean(h));
  }
  const parsed = parseToml(readFileSync(file, "utf8")) as { hooks?: unknown };
  const hooks = Array.isArray(parsed.hooks) ? parsed.hooks : [];
  return hooks
    .map((h) => h as Record<string, unknown>)
    .filter((h) => typeof h.event === "string" && typeof h.command === "string")
    .filter((h) => KNOWN_EVENTS.has(h.event as string))
    .map((h) => ({ event: h.event as HookEvent, command: String(h.command) }));
}

export function runHooks(
  cwd: string,
  event: HookEvent,
  ctx?: HookContext,
): { ok: boolean; outputs: string[] } {
  const hooks = loadHooks(cwd).filter((h) => h.event === event);
  const outputs: string[] = [];
  for (const h of hooks) {
    const result = spawnSync("bash", ["-lc", h.command], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        WANWU_HOOK_EVENT: event,
        ...(ctx?.toolName ? { WANWU_TOOL_NAME: ctx.toolName } : {}),
        ...(ctx?.toolArgs ? { WANWU_TOOL_ARGS: ctx.toolArgs.slice(0, 4000) } : {}),
        ...(ctx?.sessionId ? { WANWU_SESSION_ID: ctx.sessionId } : {}),
        ...(ctx?.sessionSource ? { WANWU_SESSION_SOURCE: ctx.sessionSource } : {}),
        ...(ctx?.prompt ? { WANWU_PROMPT: ctx.prompt.slice(0, 2000) } : {}),
        ...(ctx?.mode ? { WANWU_MODE: ctx.mode } : {}),
        ...(ctx?.permissionChoice ? { WANWU_PERMISSION_CHOICE: ctx.permissionChoice } : {}),
        ...(ctx?.denyReason ? { WANWU_DENY_REASON: ctx.denyReason } : {}),
        ...(ctx?.subagentId ? { WANWU_SUBAGENT_ID: ctx.subagentId } : {}),
        ...(ctx?.subagentKind ? { WANWU_SUBAGENT_KIND: ctx.subagentKind } : {}),
        ...(ctx?.subagentName ? { WANWU_SUBAGENT_NAME: ctx.subagentName } : {}),
        ...(ctx?.subagentOk !== undefined
          ? { WANWU_SUBAGENT_OK: String(ctx.subagentOk) }
          : {}),
        ...(ctx?.errorMessage ? { WANWU_ERROR_MESSAGE: ctx.errorMessage } : {}),
        ...(ctx?.errorSource ? { WANWU_ERROR_SOURCE: ctx.errorSource } : {}),
        ...(ctx?.stopReason ? { WANWU_STOP_REASON: ctx.stopReason } : {}),
      },
    });
    const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (text) outputs.push(text);
    if ((result.status ?? 1) !== 0) {
      return { ok: false, outputs };
    }
  }
  return { ok: true, outputs };
}
