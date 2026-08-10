#!/usr/bin/env node
/**
 * Minimal newline-delimited JSON-RPC ACP stub for local extension/CLI smoke tests.
 * Not a full ACP implementation — enough to exercise handshake + one prompt turn.
 */
import * as readline from "node:readline";

type JsonRpc =
  | { jsonrpc: "2.0"; id: string | number; method: string; params?: unknown }
  | { jsonrpc: "2.0"; id: string | number; result: unknown }
  | { jsonrpc: "2.0"; id: string | number; error: { code: number; message: string } }
  | { jsonrpc: "2.0"; method: string; params?: unknown };

function send(msg: JsonRpc): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg: JsonRpc;
  try {
    msg = JSON.parse(line) as JsonRpc;
  } catch {
    return;
  }
  if (!("method" in msg) || !("id" in msg)) {
    return;
  }

  const id = msg.id;
  const method = msg.method;

  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "0.1.0-wanwu-mock",
        agentCapabilities: { loadSession: false },
        agentInfo: { name: "wanwu-mock-acp", version: "0.1.0" },
      },
    });
    return;
  }

  if (method === "session/new" || method === "newSession") {
    send({
      jsonrpc: "2.0",
      id,
      result: { sessionId: "mock-session-1" },
    });
    return;
  }

  if (method === "session/prompt" || method === "prompt") {
    const params = (msg.params ?? {}) as { prompt?: string; text?: string };
    const text = params.prompt ?? params.text ?? "";
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "mock-session-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `Wanwu mock reply: ${text.slice(0, 200)}` },
        },
      },
    });
    send({
      jsonrpc: "2.0",
      id,
      result: { stopReason: "end_turn" },
    });
    return;
  }

  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
});

process.stderr.write("[wanwu-mock-acp] ready\n");