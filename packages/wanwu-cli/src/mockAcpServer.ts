#!/usr/bin/env node
/**
 * Minimal newline-delimited JSON-RPC ACP stub for local extension/CLI smoke tests.
 * Supports handshake, prompt streaming, tool timeline, and permission requests.
 */
import * as readline from "node:readline";
import { assessBash } from "./permission.js";

type JsonRpc = Record<string, unknown>;

function send(msg: JsonRpc): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

interface PendingPrompt {
  requestId: string | number;
  text: string;
  permissionId: number;
}

let pending: PendingPrompt | undefined;
let nextServerId = 9000;

function finishPrompt(requestId: string | number, text: string, denied?: string): void {
  if (denied) {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "mock-session-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `Blocked by permission policy: ${denied}` },
        },
      },
    });
  } else if (/\[MODE=plan\]/i.test(text)) {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "mock-session-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "Plan only (no file edits):\n1. Reproduce failing test\n2. Patch sum()\n3. Run verify\nUse Agent mode after approval.",
          },
        },
      },
    });
  } else {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "mock-session-1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tool-read-1",
          title: "Read",
          status: "completed",
          content: { type: "text", text: "README.md" },
        },
      },
    });

    const wantEdit =
      /\[SIMULATE_EDIT\]/i.test(text) ||
      (/\[MODE=agent\]/i.test(text) && /sum|failing-test-demo/i.test(text));
    if (wantEdit) {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "mock-session-1",
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "tool-edit-1",
            title: "Edit",
            status: "pending",
            content: {
              type: "diff",
              path: "examples/failing-test-demo/src/sum.js",
              before: "export function sum(a, b) {\n  return a - b;\n}\n",
              after: "export function sum(a, b) {\n  return a + b;\n}\n",
            },
          },
        },
      });
    }

    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "mock-session-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: wantEdit
              ? "Proposed edit ready for Diff Review (not applied until accepted)."
              : `Wanwu mock reply: ${text.slice(0, 200)}`,
          },
        },
      },
    });
  }
  send({
    jsonrpc: "2.0",
    id: requestId,
    result: { stopReason: "end_turn" },
  });
}

function beginPrompt(requestId: string | number, text: string): void {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "mock-session-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool-bash-1",
        title: "Bash",
        status: "pending",
        content: { type: "text", text: "echo hello" },
      },
    },
  });

  const dangerous =
    /rm\s+-rf|SIMULATE_DANGEROUS|cat\s+~\/\.ssh/i.test(text) ||
    text.includes("[SIMULATE_DANGEROUS]");
  if (dangerous) {
    const command = /cat\s+~\/\.ssh/.test(text) ? "cat ~/.ssh/id_rsa" : "rm -rf ./dist";
    const verdict = assessBash(command, "ask");
    const permissionId = nextServerId++;
    pending = { requestId, text, permissionId };
    send({
      jsonrpc: "2.0",
      id: permissionId,
      method: "session/request_permission",
      params: {
        sessionId: "mock-session-1",
        toolCall: { toolCallId: "tool-bash-1", title: "Bash", rawInput: command },
        verdict,
      },
    });
    return;
  }

  finishPrompt(requestId, text);
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

  // Client response to our permission request
  if (pending && msg.id === pending.permissionId && !("method" in msg)) {
    const result = msg.result as { optionId?: string } | undefined;
    const option = result?.optionId ?? "deny";
    const { requestId, text } = pending;
    pending = undefined;
    if (option === "deny" || option === "cancelled") {
      finishPrompt(requestId, text, "user or policy denied dangerous bash");
      return;
    }
    finishPrompt(requestId, text);
    return;
  }

  if (typeof msg.method !== "string" || msg.id === undefined) {
    return;
  }

  const id = msg.id as string | number;
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
    send({ jsonrpc: "2.0", id, result: { sessionId: "mock-session-1" } });
    return;
  }

  if (method === "session/prompt" || method === "prompt") {
    const params = (msg.params ?? {}) as { prompt?: string; text?: string };
    const text = params.prompt ?? params.text ?? "";
    beginPrompt(id, text);
    return;
  }

  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
});

process.stderr.write("[wanwu-mock-acp] ready\n");