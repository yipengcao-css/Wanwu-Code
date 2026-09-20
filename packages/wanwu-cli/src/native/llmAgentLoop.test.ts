import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG, mergeConfig } from "@wanwu/config";
import { runLlmAgentLoop } from "./llmAgentLoop.js";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../wanwu-providers/fixtures",
);

describe("runLlmAgentLoop", () => {
  it("runs Read tool then final answer via fixtures", async () => {
    const round1 = readFileSync(path.join(fixtures, "openai-tool-round1.json"), "utf8");
    const round2 = readFileSync(path.join(fixtures, "openai-tool-round2.json"), "utf8");
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      const body = calls === 1 ? round1 : round2;
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    };

    const config = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "openai",
      model: "deepseek-chat",
    });
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

    const result = await runLlmAgentLoop(
      {
        workspaceRoot: root,
        sessionId: "test-session",
        permissionMode: "ask",
        mode: "ask",
      },
      config,
      "用工具读取 README 并给出标题",
      { fetchImpl, maxTurns: 4, stream: false },
    );

    expect(calls).toBe(2);
    expect(result.toolsUsed).toContain("Read");
    expect(result.text).toMatch(/Wanwu-Code|README/i);
    expect(result.turns).toBeGreaterThanOrEqual(2);
    expect(result.messages.some((m) => m.role === "user")).toBe(true);
  });

  it("continues from prior history on the next prompt", async () => {
    const round2 = readFileSync(path.join(fixtures, "openai-tool-round2.json"), "utf8");
    let sawMessages = 0;
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages: Array<{ role: string; content?: string }>;
      };
      sawMessages = body.messages.length;
      return new Response(round2, { status: 200, headers: { "content-type": "application/json" } });
    };

    const config = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "openai",
      model: "deepseek-chat",
    });
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

    await runLlmAgentLoop(
      {
        workspaceRoot: root,
        sessionId: "test-session-2",
        permissionMode: "ask",
        mode: "ask",
      },
      config,
      "第二轮：继续",
      {
        fetchImpl,
        maxTurns: 2,
        stream: false,
        history: [
          { role: "user", content: "第一轮问题" },
          { role: "assistant", content: "第一轮回答" },
        ],
      },
    );

    // system + 2 history + new user
    expect(sawMessages).toBeGreaterThanOrEqual(4);
  });

  it("streams by default and records usage", async () => {
    const sse = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
      `data: ${JSON.stringify({
        choices: [{ delta: { content: " world" } }],
        usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 },
      })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    const fetchImpl: typeof fetch = async () =>
      new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });

    const config = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "openai",
      model: "deepseek-chat",
    });
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

    const result = await runLlmAgentLoop(
      {
        workspaceRoot: root,
        sessionId: "test-stream",
        permissionMode: "ask",
        mode: "ask",
      },
      config,
      "say hi",
      { fetchImpl, maxTurns: 1 },
    );

    expect(result.text).toMatch(/Hello world/);
    expect(result.usage?.inputTokens).toBe(11);
    expect(result.usage?.outputTokens).toBe(2);
    expect(result.usage?.totalTokens).toBe(13);
  });

  it("omits write tools from the request in ask mode", async () => {
    const round2 = readFileSync(path.join(fixtures, "openai-tool-round2.json"), "utf8");
    let names: string[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      names = (body.tools ?? []).map((t) => t.function?.name ?? "").filter(Boolean);
      return new Response(round2, { status: 200, headers: { "content-type": "application/json" } });
    };
    const config = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "openai",
      model: "deepseek-chat",
    });
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
    await runLlmAgentLoop(
      {
        workspaceRoot: root,
        sessionId: "test-ask-tools",
        permissionMode: "ask",
        mode: "ask",
      },
      config,
      "[MODE=ask] 这段代码做什么",
      { fetchImpl, maxTurns: 1, stream: false },
    );
    expect(names).toContain("Read");
    expect(names).not.toContain("Edit");
    expect(names).not.toContain("Write");
    expect(names).not.toContain("Task");
    expect(names).not.toContain("Bash");
  });
});
