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
      { fetchImpl, maxTurns: 4 },
    );

    expect(calls).toBe(2);
    expect(result.toolsUsed).toContain("Read");
    expect(result.text).toMatch(/Wanwu-Code|README/i);
    expect(result.turns).toBeGreaterThanOrEqual(2);
  });
});
