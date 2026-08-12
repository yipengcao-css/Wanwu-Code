import type { WanwuMode } from "@wanwu/config";
import { runHooks } from "../hooks.js";
import type { AgentContext } from "./agentLoop.js";
import { toolBash, toolEdit, toolGlob, toolGrep, toolRead, type ToolResult } from "./tools.js";

function withHooks(
  ctx: AgentContext,
  name: string,
  run: () => ToolResult,
): ToolResult {
  const pre = runHooks(ctx.workspaceRoot, "PreToolUse");
  if (!pre.ok) {
    return {
      ok: false,
      title: name,
      text: `PreToolUse hook blocked tool ${name}\n${pre.outputs.join("\n")}`.trim(),
    };
  }
  const result = run();
  const post = runHooks(ctx.workspaceRoot, "PostToolUse");
  if (!post.ok) {
    return {
      ok: false,
      title: name,
      text: `${result.text}\n\nPostToolUse hook failed:\n${post.outputs.join("\n")}`.trim(),
    };
  }
  if (post.outputs.length) {
    return {
      ...result,
      text: `${result.text}\n\n[hooks]\n${post.outputs.join("\n")}`.trim(),
    };
  }
  return result;
}

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

  return withHooks(ctx, name, () => {
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
      case "Bash":
        if (
          writeBlocked &&
          !/^(\s)*(ls|pwd|cat|head|tail|rg|grep|find|echo|node -v|pnpm -v)/i.test(
            String(args.command ?? ""),
          )
        ) {
          // allow mild readonly-ish; still pass through assessBash
        }
        return toolBash(ctx.workspaceRoot, String(args.command ?? ""), ctx.permissionMode);
      default:
        return { ok: false, title: name, text: `unknown tool: ${name}` };
    }
  });
}
