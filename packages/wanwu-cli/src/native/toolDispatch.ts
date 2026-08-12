import type { WanwuMode } from "@wanwu/config";
import { runHooks } from "../hooks.js";
import { assessToolCall } from "../permission.js";
import type { AgentContext } from "./agentLoop.js";
import { gateToolCall } from "./permissions.js";
import { toolBash, toolEdit, toolGlob, toolGrep, toolRead, type ToolResult } from "./tools.js";

async function withHooks(
  ctx: AgentContext,
  name: string,
  run: () => ToolResult | Promise<ToolResult>,
): Promise<ToolResult> {
  const pre = runHooks(ctx.workspaceRoot, "PreToolUse");
  if (!pre.ok) {
    return {
      ok: false,
      title: name,
      text: `PreToolUse hook blocked tool ${name}\n${pre.outputs.join("\n")}`.trim(),
    };
  }
  const result = await run();
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

export async function dispatchTool(
  ctx: AgentContext,
  mode: WanwuMode,
  name: string,
  argsJson: string,
): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return { ok: false, title: name, text: `invalid JSON arguments: ${argsJson}` };
  }

  const writeBlocked = mode === "plan" || mode === "ask" || mode === "verify";

  return withHooks(ctx, name, async () => {
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
        const gate = await gateToolCall("Edit", String(args.path ?? ""), ctx.permissionMode);
        if (!gate.allow) {
          return { ok: false, title: "Edit", text: gate.text ?? "Edit denied" };
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
        const gate = await gateToolCall("Bash", command, ctx.permissionMode);
        if (!gate.allow) {
          return { ok: false, title: "Bash", text: gate.text ?? "Bash denied" };
        }
        return toolBash(ctx.workspaceRoot, command, ctx.permissionMode);
      }
      default:
        return { ok: false, title: name, text: `unknown tool: ${name}` };
    }
  });
}

/** Sync wrapper for deterministic paths that cannot await (agentLoop). */
export function dispatchToolSync(
  ctx: AgentContext,
  mode: WanwuMode,
  name: string,
  argsJson: string,
): ToolResult {
  // For sync callers we skip the async permission prompt and rely on
  // assessToolCall/assessBash policy only (no interactive gate).
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return { ok: false, title: name, text: `invalid JSON arguments: ${argsJson}` };
  }
  const writeBlocked = mode === "plan" || mode === "ask" || mode === "verify";
  const pre = runHooks(ctx.workspaceRoot, "PreToolUse");
  if (!pre.ok) {
    return {
      ok: false,
      title: name,
      text: `PreToolUse hook blocked tool ${name}\n${pre.outputs.join("\n")}`.trim(),
    };
  }
  let result: ToolResult;
  switch (name) {
    case "Read":
      result = toolRead(ctx.workspaceRoot, String(args.path ?? ""));
      break;
    case "Glob":
      result = toolGlob(ctx.workspaceRoot, String(args.pattern ?? "**/*"));
      break;
    case "Grep":
      result = toolGrep(
        ctx.workspaceRoot,
        String(args.pattern ?? ""),
        args.glob ? String(args.glob) : "**/*",
      );
      break;
    case "Edit": {
      if (writeBlocked) {
        result = { ok: false, title: "Edit", text: `Edit blocked in mode=${mode}` };
        break;
      }
      const verdict = assessToolCall("Edit", String(args.path ?? ""), ctx.permissionMode);
      if (!verdict.allow) {
        result = {
          ok: false,
          title: "Edit",
          text: `Blocked by permission: ${verdict.reason}${
            verdict.requiresPrompt ? " (requires confirmation)" : ""
          }`,
        };
        break;
      }
      result = toolEdit(ctx.workspaceRoot, String(args.path ?? ""), String(args.content ?? ""), {
        apply: false,
      });
      break;
    }
    case "Bash": {
      const command = String(args.command ?? "");
      if (writeBlocked && !READONLY_BASH.test(command)) {
        result = {
          ok: false,
          title: "Bash",
          text: `Bash blocked in mode=${mode} (only read-only commands allowed)`,
        };
        break;
      }
      result = toolBash(ctx.workspaceRoot, command, ctx.permissionMode);
      break;
    }
    default:
      result = { ok: false, title: name, text: `unknown tool: ${name}` };
  }
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
