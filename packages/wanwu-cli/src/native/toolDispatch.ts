import type { WanwuMode } from "@wanwu/config";
import { runHooks } from "../hooks.js";
import { parseQualifiedMcpTool } from "../mcp/loadConfig.js";
import { peekMcpRegistry } from "../mcp/registry.js";
import { assessToolCall } from "../permission.js";
import type { AgentContext } from "./agentLoop.js";
import { gateToolCall } from "./permissions.js";
import { runSubagents } from "./subagents/pool.js";
import type { SubagentSpec } from "./subagents/types.js";
import { toolBash, toolEdit, toolGlob, toolGrep, toolRead, type ToolResult } from "./tools.js";

async function withHooks(
  ctx: AgentContext,
  name: string,
  argsJson: string,
  run: () => ToolResult | Promise<ToolResult>,
): Promise<ToolResult> {
  const pre = runHooks(ctx.workspaceRoot, "PreToolUse", {
    toolName: name,
    toolArgs: argsJson,
  });
  if (!pre.ok) {
    return {
      ok: false,
      title: name,
      text: `PreToolUse hook blocked tool ${name}\n${pre.outputs.join("\n")}`.trim(),
    };
  }
  const result = await run();
  const post = runHooks(ctx.workspaceRoot, "PostToolUse", {
    toolName: name,
    toolArgs: argsJson,
  });
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

  return withHooks(ctx, name, argsJson, async () => {
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
      case "Edit": {
        if (writeBlocked) {
          return {
            ok: false,
            title: "Edit",
            text: `Edit blocked in mode=${mode}`,
          };
        }
        const gate = await gateToolCall(
          "Edit",
          String(args.path ?? ""),
          ctx.permissionMode,
          ctx.workspaceRoot,
        );
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
        const gate = await gateToolCall("Bash", command, ctx.permissionMode, ctx.workspaceRoot);
        if (!gate.allow) {
          return { ok: false, title: "Bash", text: gate.text ?? "Bash denied" };
        }
        return toolBash(
          ctx.workspaceRoot,
          command,
          ctx.permissionMode,
          ctx.config?.sandbox ?? "workspace",
        );
      }
      case "Task": {
        if (!ctx.config) {
          return { ok: false, title: "Task", text: "Task requires LLM config context" };
        }
        const agents = Array.isArray(args.agents) ? (args.agents as SubagentSpec[]) : [];
        if (!agents.length) {
          return { ok: false, title: "Task", text: "Task requires agents array" };
        }
        const concurrency = Number(args.concurrency ?? "2") || 2;
        const result = await runSubagents(agents, {
          parentSessionId: ctx.sessionId,
          workspaceRoot: ctx.workspaceRoot,
          permissionMode: ctx.permissionMode,
          config: ctx.config,
          concurrency,
        });
        return { ok: true, title: "Task", text: result.aggregateText };
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
  const pre = runHooks(ctx.workspaceRoot, "PreToolUse", {
    toolName: name,
    toolArgs: argsJson,
  });
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
      result = toolBash(
        ctx.workspaceRoot,
        command,
        ctx.permissionMode,
        ctx.config?.sandbox ?? "workspace",
      );
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
