import type { WanwuMode } from "@wanwu/config";
import { runHooks } from "../hooks.js";
import { assessToolCall } from "../permission.js";
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

const READONLY_BASH =
  /^(\s)*(ls|pwd|cat|head|tail|rg|grep|find|echo|node -v|pnpm -v|git status|git diff|git log)\b/i;

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
      case "Edit": {
        if (writeBlocked) {
          return {
            ok: false,
            title: "Edit",
            text: `Edit blocked in mode=${mode}`,
          };
        }
        const verdict = assessToolCall("Edit", String(args.path ?? ""), ctx.permissionMode);
        if (!verdict.allow) {
          return {
            ok: false,
            title: "Edit",
            text: `Blocked by permission: ${verdict.reason}${
              verdict.requiresPrompt ? " (requires confirmation)" : ""
            }`,
          };
        }
        // Propose only — the Shell DiffReview decides whether to persist.
        return toolEdit(ctx.workspaceRoot, String(args.path ?? ""), String(args.content ?? ""), {
          apply: false,
        });
      }
      case "Bash": {
        const command = String(args.command ?? "");
        if (writeBlocked && !READONLY_BASH.test(command)) {
          return {
            ok: false,
            title: "Bash",
            text: `Bash blocked in mode=${mode} (only read-only commands allowed)`,
          };
        }
        return toolBash(ctx.workspaceRoot, command, ctx.permissionMode);
      }
      default:
        return { ok: false, title: name, text: `unknown tool: ${name}` };
    }
  });
}
