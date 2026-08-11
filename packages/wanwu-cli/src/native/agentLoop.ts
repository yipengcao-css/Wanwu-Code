import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PermissionMode, WanwuMode } from "@wanwu/config";
import { discoverMemory } from "../memory.js";
import { sessionUpdate } from "./jsonRpcStdio.js";
import { toolBash, toolEdit, toolGlob, toolGrep, toolRead } from "./tools.js";

export interface AgentContext {
  workspaceRoot: string;
  sessionId: string;
  permissionMode: PermissionMode;
  mode: WanwuMode;
}

function detectMode(prompt: string, fallback: WanwuMode): WanwuMode {
  if (/\[MODE=plan\]/i.test(prompt)) return "plan";
  if (/\[MODE=agent\]/i.test(prompt)) return "agent";
  if (/\[MODE=ask\]/i.test(prompt)) return "ask";
  if (/\[MODE=verify\]/i.test(prompt)) return "verify";
  return fallback;
}

function memoryPreamble(workspaceRoot: string): string {
  const files = discoverMemory(workspaceRoot);
  if (!files.length) return "";
  const chunks: string[] = [];
  for (const f of files.slice(0, 3)) {
    try {
      const body = readFileSync(f.path, "utf8").slice(0, 1500);
      chunks.push(`# Memory: ${f.kind}\n${body}`);
    } catch {
      /* skip */
    }
  }
  return chunks.join("\n\n");
}

function emitTool(
  sessionId: string,
  toolCallId: string,
  title: string,
  status: "completed" | "failed" | "pending",
  content: Record<string, unknown>,
): void {
  sessionUpdate(sessionId, {
    sessionUpdate: "tool_call",
    toolCallId,
    title,
    status,
    content,
  });
}

/**
 * Deterministic one-turn agent: pick tools from prompt heuristics, no LLM required.
 */
export function runDeterministicTurn(ctx: AgentContext, prompt: string): string {
  const mode = detectMode(prompt, ctx.mode);
  const mem = memoryPreamble(ctx.workspaceRoot);
  const sid = ctx.sessionId;
  let toolSeq = 0;
  const nextId = (): string => `native-tool-${++toolSeq}`;

  if (mode === "plan") {
    sessionUpdate(sid, {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text:
          (mem ? `(loaded ${discoverMemory(ctx.workspaceRoot).length} memory file(s))\n\n` : "") +
          "Plan only (no file edits):\n" +
          "1. Explore relevant files with Read/Glob/Grep\n" +
          "2. Draft a minimal patch plan\n" +
          "3. After approval, switch to Agent mode and Verify\n" +
          `Prompt: ${prompt.replace(/\[MODE=\w+\]/gi, "").trim().slice(0, 300)}`,
      },
    });
    return "plan";
  }

  // Always try to orient with Glob or Read README
  const readmeCandidates = ["README.md", "readme.md", "Readme.md"];
  const readme = readmeCandidates.find((p) => existsSync(join(ctx.workspaceRoot, p)));
  if (readme) {
    const r = toolRead(ctx.workspaceRoot, readme);
    emitTool(sid, nextId(), "Read", r.ok ? "completed" : "failed", {
      type: "text",
      text: `${readme}\n${r.text.slice(0, 2000)}`,
    });
  } else {
    const g = toolGlob(ctx.workspaceRoot, "*.md");
    emitTool(sid, nextId(), "Glob", "completed", { type: "text", text: g.text });
  }

  // Grep if user asks to find something
  const grepMatch = prompt.match(/(?:find|grep|search)\s+[「"']?([\w.-]+)[」"']?/i);
  if (grepMatch?.[1]) {
    const g = toolGrep(ctx.workspaceRoot, grepMatch[1]);
    emitTool(sid, nextId(), "Grep", g.ok ? "completed" : "failed", {
      type: "text",
      text: g.text.slice(0, 3000),
    });
  }

  // Bash intent
  const bashMatch =
    prompt.match(/`([^`]+)`/) ||
    prompt.match(/(?:run|执行)\s+(.+)$/i) ||
    (/SIMULATE_DANGEROUS|rm\s+-rf|cat\s+~\/\.ssh/i.test(prompt)
      ? [null, /cat\s+~\/\.ssh/.test(prompt) ? "cat ~/.ssh/id_rsa" : "rm -rf ./dist"]
      : null);
  if (bashMatch?.[1]) {
    const cmd = String(bashMatch[1]).trim();
    const b = toolBash(ctx.workspaceRoot, cmd, ctx.permissionMode);
    emitTool(sid, nextId(), "Bash", b.ok ? "completed" : "failed", {
      type: "text",
      text: `$ ${cmd}\n${b.text}`,
    });
    if (!b.ok && /Blocked by permission/i.test(b.text)) {
      sessionUpdate(sid, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `Blocked by permission policy: ${b.text}` },
      });
      return "denied";
    }
  }

  // Edit proposal for failing-test-demo / sum
  const wantEdit =
    mode === "agent" &&
    (/\[SIMULATE_EDIT\]/i.test(prompt) || /sum|failing-test-demo/i.test(prompt));
  if (wantEdit) {
    const path = "examples/failing-test-demo/src/sum.js";
    const after = "export function sum(a, b) {\n  return a + b;\n}\n";
    const apply = ctx.permissionMode === "accept-edits" || ctx.permissionMode === "accept-all";
    const e = toolEdit(ctx.workspaceRoot, path, after, { apply });
    if (e.diff) {
      emitTool(sid, nextId(), "Edit", apply ? "completed" : "pending", {
        type: "diff",
        path: e.diff.path,
        before: e.diff.before,
        after: e.diff.after,
      });
    }
    sessionUpdate(sid, {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: apply
          ? `Applied edit to ${path}.`
          : `Proposed edit for ${path} (not applied in ask mode; accept-edits to write).`,
      },
    });
    return "edit";
  }

  // Title extraction heuristic for "列出 README 标题"
  let summary = "Wanwu native agent finished a tool-assisted turn.";
  if (readme && /标题|title|README/i.test(prompt)) {
    const body = toolRead(ctx.workspaceRoot, readme).text;
    const heading = body.split(/\r?\n/).find((l) => /^#\s+/.test(l));
    if (heading) {
      summary = `README 标题：${heading.replace(/^#\s+/, "").trim()}`;
    }
  }

  sessionUpdate(sid, {
    sessionUpdate: "agent_message_chunk",
    content: {
      type: "text",
      text: (mem ? "(memory loaded)\n" : "") + summary,
    },
  });
  return "ok";
}
