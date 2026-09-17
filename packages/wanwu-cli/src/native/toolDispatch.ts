import type { WanwuMode } from "@wanwu/config";
import { isReadOnlyBash } from "../permission.js";
import type { AgentContext } from "./agentLoop.js";
import { toolBash, toolEdit, toolGlob, toolGrep, toolRead, type ToolResult } from "./tools.js";

export function dispatchTool(
  ctx: AgentContext,
  mode: WanwuMode,
  name: string,
  argsJson: string,
): ToolResult {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return { ok: false, title: name, text: `invalid JSON arguments: ${argsJson}` };
  }

  const writeBlocked = mode === "plan" || mode === "ask" || mode === "verify";

  switch (name) {
    case "Read":
      return toolRead(ctx.workspaceRoot, String(args.path ?? ""));
    case "Glob":
      return toolGlob(ctx.workspaceRoot, String(args.pattern ?? "**/*"));
    case "Grep":
      return toolGrep(
        ctx.workspaceRoot,
        String(args.pattern ?? ""),
        args.glob ? String(args.glob) : "**/*",
      );
    case "Edit":
      if (writeBlocked) {
        return {
          ok: false,
          title: "Edit",
          text: `Edit blocked in mode=${mode}`,
        };
      }
      return toolEdit(ctx.workspaceRoot, String(args.path ?? ""), String(args.content ?? ""), {
        apply: true,
      });
    case "Bash": {
      const command = String(args.command ?? "");
      if (writeBlocked && !isReadOnlyBash(command)) {
        return {
          ok: false,
          title: "Bash",
          text: `Bash blocked in mode=${mode}: only read-only commands are allowed (switch to agent mode to mutate the workspace).`,
        };
      }
      return toolBash(ctx.workspaceRoot, command, ctx.permissionMode);
    }
    default:
      return { ok: false, title: name, text: `unknown tool: ${name}` };
  }
}
