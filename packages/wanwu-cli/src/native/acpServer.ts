#!/usr/bin/env node
/**
 * Wanwu-native ACP stdio server — no grok binary required.
 */
import * as readline from "node:readline";
import type { ChatMessage } from "@wanwu/providers";
import { loadWanwuConfig } from "@wanwu/config";
import { ensureMcpRegistry } from "../mcp/registry.js";
import { findWorkspaceRoot } from "../workspaceRoot.js";
import { runPlanAsync } from "../plan.js";
import { runVerifyWithReview } from "../verify.js";
import { runDeterministicTurn } from "./agentLoop.js";
import { runLlmAgentLoop, shouldUseLlm } from "./llmAgentLoop.js";
import type { JsonRpc } from "./jsonRpcStdio.js";
import { sendError, sendResult, sessionUpdate } from "./jsonRpcStdio.js";
import { detectMode, stripModeTags } from "./mode.js";
import { resolvePermissionRequest } from "./permissions.js";
import { loadSession, saveSession } from "./sessionStore.js";

type SessionState = {
  id: string;
  /** Cross-prompt transcript for LLM (system messages stripped on use). */
  history: ChatMessage[];
  /** AbortController for the in-flight prompt, if any. */
  abort?: AbortController;
};

export function startNativeAcpStdioServer(): void {
  const workspaceRoot = process.env.WANWU_WORKSPACE_ROOT?.trim() || findWorkspaceRoot();
  const { config } = loadWanwuConfig(workspaceRoot);

  const sessions = new Map<string, SessionState>();
  let sessionCounter = 0;
  let mcpReady: Promise<void> | undefined;

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on("line", (line) => {
    void handleLine(line);
  });

  function warmMcp(): Promise<void> {
    if (!mcpReady) {
      mcpReady = ensureMcpRegistry(workspaceRoot).then(() => undefined);
    }
    return mcpReady;
  }

  async function handleLine(line: string): Promise<void> {
    if (!line.trim()) return;
    let msg: JsonRpc;
    try {
      msg = JSON.parse(line) as JsonRpc;
    } catch {
      return;
    }

    // Client response to a session/request_permission we initiated.
    if (
      typeof msg.id === "number" &&
      msg.method === undefined &&
      (msg.result !== undefined || msg.error !== undefined)
    ) {
      const result = msg.result as { optionId?: string } | undefined;
      resolvePermissionRequest(msg.id, result?.optionId ?? "deny");
      return;
    }

    if (typeof msg.method !== "string" || msg.id === undefined) {
      return;
    }

    const id = msg.id as string | number;
    const method = msg.method;

    if (method === "initialize") {
      void warmMcp();
      sendResult(id, {
        protocolVersion: "0.1.0-wanwu-native",
        agentCapabilities: { loadSession: true },
        agentInfo: { name: "wanwu-native", version: "1.0.0-beta" },
      });
      return;
    }

    if (method === "session/new" || method === "newSession") {
      const sessionId = `wanwu-native-${++sessionCounter}`;
      sessions.set(sessionId, { id: sessionId, history: [] });
      sendResult(id, { sessionId });
      return;
    }

    if (method === "session/load" || method === "loadSession") {
      const params = (msg.params ?? {}) as { sessionId?: string };
      const targetId = params.sessionId;
      if (!targetId) {
        sendError(id, -32602, "sessionId required");
        return;
      }
      const stored = loadSession(workspaceRoot, targetId);
      if (!stored) {
        sendError(id, -32000, "session not found");
        return;
      }
      sessions.set(targetId, { id: targetId, history: stored.history });
      sendResult(id, { sessionId: targetId, history: stored.history });
      return;
    }

    if (method === "session/cancel") {
      const params = (msg.params ?? {}) as { sessionId?: string };
      const targetId = params.sessionId ?? [...sessions.keys()][0];
      const session = targetId ? sessions.get(targetId) : undefined;
      if (session?.abort) {
        session.abort.abort();
        session.abort = undefined;
      }
      sendResult(id, {});
      return;
    }

    if (method === "session/prompt" || method === "prompt") {
      const params = (msg.params ?? {}) as {
        sessionId?: string;
        prompt?: string;
        text?: string;
      };
      const sessionId = params.sessionId ?? [...sessions.keys()][0];
      if (!sessionId || !sessions.has(sessionId)) {
        sendError(id, -32000, "unknown session");
        return;
      }
      const session = sessions.get(sessionId)!;
      const text = params.prompt ?? params.text ?? "";
      const mode = detectMode(text, config.defaultMode);
      const ctx = {
        workspaceRoot,
        sessionId,
        permissionMode: config.permissionMode,
        mode: config.defaultMode,
        config,
      };
      try {
        // Plan/Verify are real workflow gates (not prompt candy).
        if (mode === "plan") {
          const prev = process.env.WANWU_PLAN_QUIET;
          process.env.WANWU_PLAN_QUIET = "1";
          let planPath = "";
          try {
            planPath = await runPlanAsync(stripModeTags(text) || "Untitled task", workspaceRoot);
          } finally {
            if (prev === undefined) delete process.env.WANWU_PLAN_QUIET;
            else process.env.WANWU_PLAN_QUIET = prev;
          }
          sessionUpdate(sessionId, {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: `已写入 Plan 工件：\n${planPath}\n` },
          });
        }
        if (mode === "verify") {
          sessionUpdate(sessionId, {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "正在运行隔离 Verify（typecheck → test → lint）…\n",
            },
          });
          const result = await runVerifyWithReview(workspaceRoot, { quiet: true });
          sessionUpdate(sessionId, {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text:
                (result.code === 0 ? "Verify 通过。\n\n" : `Verify 失败（exit=${result.code}）。\n\n`) +
                result.log.slice(0, 6000) +
                (result.review ? `\n\n## 独立评审\n${result.review}` : ""),
            },
          });
          sendResult(id, { stopReason: result.code === 0 ? "end_turn" : "end_turn" });
          return;
        }

        if (shouldUseLlm(config)) {
          await warmMcp();
          session.abort = new AbortController();
          try {
            const out = await runLlmAgentLoop(ctx, config, text, {
              history: session.history,
              signal: session.abort.signal,
            });
            session.history = out.messages.filter((m) => m.role !== "system");
            saveSession({
              id: sessionId,
              workspaceRoot,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              history: session.history,
            });
          } finally {
            session.abort = undefined;
          }
        } else if (mode !== "plan") {
          // Deterministic path also handles plan/verify; skip double-plan when already written.
          runDeterministicTurn(ctx, text);
        } else {
          // Plan artifact already written; deterministic would duplicate — skip.
        }
        sendResult(id, { stopReason: "end_turn" });
      } catch (err) {
        sendError(id, -32001, err instanceof Error ? err.message : String(err));
      }
      return;
    }

    sendError(id, -32601, `Method not found: ${method}`);
  }

  process.stderr.write(
    `[wanwu-native] ready workspace=${workspaceRoot} llm=${shouldUseLlm(config) ? "on" : "deterministic"}\n`,
  );
}

const isMain =
  typeof process.argv[1] === "string" &&
  (process.argv[1].includes("acpServer") || process.env.WANWU_INTERNAL_ACP === "1");

if (isMain || process.argv.includes("--wanwu-internal-acp")) {
  startNativeAcpStdioServer();
}
