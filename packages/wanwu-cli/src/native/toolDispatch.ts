import type { WanwuMode } from "@wanwu/config";
import { runHooks } from "../hooks.js";
import { parseQualifiedMcpTool } from "../mcp/loadConfig.js";
import { peekMcpRegistry } from "../mcp/registry.js";
import type { AgentContext } from "./agentLoop.js";
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

async function dispatchMcp(
  ctx: AgentContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const parsed = parseQualifiedMcpTool(name);
  if (!parsed) {
    return { ok: false, title: name, text: `invalid MCP tool name: ${name}` };
  }
  const reg = peekMcpRegistry(ctx.workspaceRoot);
  if (!reg?.hasTool(name)) {
    return {
      ok: false,
      title: name,
      text: `MCP tool not available (server not started or unknown): ${name}`,
    };
  }
  try {
    const text = await reg.callTool(name, args);
    return { ok: true, title: name, text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, title: name, text: msg };
  }
}

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
    if (name.startsWith("mcp__")) {
      // MCP servers are user-configured RCE surface — always gated by hooks above.
      return dispatchMcp(ctx, name, args);
    }
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
