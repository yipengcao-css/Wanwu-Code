#!/usr/bin/env node
/**
 * Wanwu-native ACP stdio server — no grok binary required.
 */
import * as readline from "node:readline";
import { loadWanwuConfig } from "@wanwu/config";
import { findWorkspaceRoot } from "../workspaceRoot.js";
import { runDeterministicTurn } from "./agentLoop.js";
import { runLlmAgentLoop, shouldUseLlm } from "./llmAgentLoop.js";
import type { JsonRpc } from "./jsonRpcStdio.js";
import { sendError, sendResult } from "./jsonRpcStdio.js";

export function startNativeAcpStdioServer(): void {
  const workspaceRoot = process.env.WANWU_WORKSPACE_ROOT?.trim() || findWorkspaceRoot();
  const { config } = loadWanwuConfig(workspaceRoot);

  const sessions = new Map<string, { id: string }>();
  let sessionCounter = 0;

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on("line", (line) => {
    void handleLine(line);
  });

  async function handleLine(line: string): Promise<void> {
    if (!line.trim()) return;
    let msg: JsonRpc;
    try {
      msg = JSON.parse(line) as JsonRpc;
    } catch {
      return;
    }

    if (typeof msg.method !== "string" || msg.id === undefined) {
      return;
    }

    const id = msg.id as string | number;
    const method = msg.method;

    if (method === "initialize") {
      sendResult(id, {
        protocolVersion: "0.1.0-wanwu-native",
        agentCapabilities: { loadSession: false },
        agentInfo: { name: "wanwu-native", version: "1.0.0-beta" },
      });
      return;
    }

    if (method === "session/new" || method === "newSession") {
      const sessionId = `wanwu-native-${++sessionCounter}`;
      sessions.set(sessionId, { id: sessionId });
      sendResult(id, { sessionId });
      return;
    }

    if (method === "session/cancel") {
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
      const text = params.prompt ?? params.text ?? "";
      const ctx = {
        workspaceRoot,
        sessionId,
        permissionMode: config.permissionMode,
        mode: config.defaultMode,
      };
      try {
      if (shouldUseLlm(config)) {
        await runLlmAgentLoop(ctx, config, text);
      } else {
        runDeterministicTurn(ctx, text);
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
