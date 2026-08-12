import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "@wanwu/config";
import { completeChat } from "./complete.js";
import { ProviderError } from "./types.js";
import { hasProviderCredentials, resolveProvider } from "./resolve.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, "../fixtures");

function fixtureFetch(file: string, status = 200): typeof fetch {
  const body = readFileSync(path.join(fixtures, file), "utf8");
  return async () =>
    new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    });
}

describe("@wanwu/providers", () => {
  it("resolves openai-compat base_url and appends /v1", () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "openai",
      model: "deepseek-chat",
      providers: {
        ...DEFAULT_CONFIG.providers,
        openai: {
          apiKeyEnv: "OPENAI_API_KEY",
          baseUrl: "https://api.deepseek.com",
          defaultModel: "deepseek-chat",
        },
      },
    });
    const resolved = resolveProvider(config, { env: { OPENAI_API_KEY: "sk-test" } });
    expect(resolved.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(resolved.kind).toBe("openai-compat");
  });

  it("completes via openai fixture", async () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "openai",
      model: "gpt-test",
    });
    const res = await completeChat({
      config,
      env: { OPENAI_API_KEY: "sk-test" },
      fetchImpl: fixtureFetch("openai-chat.json"),
      request: { messages: [{ role: "user", content: "reply pong" }] },
    });
    expect(res.text).toBe("pong");
    expect(res.provider).toBe("openai");
  });

  it("completes via anthropic fixture", async () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "anthropic",
      model: "claude-sonnet-4",
    });
    const res = await completeChat({
      config,
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
      fetchImpl: fixtureFetch("anthropic-messages.json"),
      request: {
        messages: [
          { role: "system", content: "be brief" },
          { role: "user", content: "reply pong" },
        ],
      },
    });
    expect(res.text).toBe("pong");
    expect(res.provider).toBe("anthropic");
  });

  it("completes xai and ollama fixtures", async () => {
    const xai = await completeChat({
      config: mergeConfig(DEFAULT_CONFIG, { activeProvider: "xai", model: "grok-4" }),
      env: { XAI_API_KEY: "xai-test" },
      fetchImpl: fixtureFetch("xai-chat.json"),
      request: { messages: [{ role: "user", content: "hi" }] },
    });
    expect(xai.text).toBe("pong-xai");

    const ollama = await completeChat({
      config: mergeConfig(DEFAULT_CONFIG, { activeProvider: "ollama", model: "llama3.2" }),
      env: {},
      fetchImpl: fixtureFetch("ollama-chat.json"),
      request: { messages: [{ role: "user", content: "hi" }] },
    });
    expect(ollama.text).toBe("pong-ollama");
  });

  it("maps 401 to auth ProviderError with hint", async () => {
    const config = mergeConfig(DEFAULT_CONFIG, { activeProvider: "openai" });
    await expect(
      completeChat({
        config,
        env: { OPENAI_API_KEY: "bad" },
        fetchImpl: fixtureFetch("openai-chat.json", 401),
        request: { messages: [{ role: "user", content: "hi" }] },
      }),
    ).rejects.toMatchObject({
      name: "ProviderError",
      code: "auth",
    } satisfies Partial<ProviderError>);
  });

  it("hasProviderCredentials false without key", () => {
    expect(hasProviderCredentials(DEFAULT_CONFIG, { env: {} })).toBe(false);
    expect(
      hasProviderCredentials(DEFAULT_CONFIG, { env: { OPENAI_API_KEY: "sk" } }),
    ).toBe(true);
  });

  it("anthropic sends tools and parses tool_use", async () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "anthropic",
      model: "claude-sonnet-4",
    });
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const body = readFileSync(
        path.join(fixtures, "anthropic-tool-round1.json"),
        "utf8",
      );
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const res = await completeChat({
      config,
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
      fetchImpl,
      request: {
        messages: [{ role: "user", content: "读取 README" }],
        tools: [
          {
            name: "Read",
            description: "Read a file",
            parameters: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
            },
          },
        ],
        toolChoice: "auto",
      },
    });

    expect(res.provider).toBe("anthropic");
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0]?.name).toBe("Read");
    expect(JSON.parse(res.toolCalls?.[0]?.arguments ?? "{}")).toEqual({
      path: "README.md",
    });
    expect(capturedBody?.tools).toBeDefined();
    expect((capturedBody?.tools as unknown[])[0]).toMatchObject({
      name: "Read",
      input_schema: { type: "object" },
    });
  });

  it("anthropic maps tool result messages to tool_result blocks", async () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "anthropic",
      model: "claude-sonnet-4",
    });
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const body = readFileSync(
        path.join(fixtures, "anthropic-tool-round2.json"),
        "utf8",
      );
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const res = await completeChat({
      config,
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
      fetchImpl,
      request: {
        messages: [
          { role: "user", content: "读取 README" },
          {
            role: "assistant",
            content: "我先读取 README。",
            toolCalls: [
              { id: "toolu_01", name: "Read", arguments: '{"path":"README.md"}' },
            ],
          },
          {
            role: "tool",
            toolCallId: "toolu_01",
            name: "Read",
            content: "# Wanwu-Code",
          },
        ],
      },
    });

    expect(res.text).toContain("Wanwu-Code");
    const messages = capturedBody?.messages as Array<{
      role: string;
      content: unknown;
    }>;
    const toolResultMsg = messages.find(
      (m) =>
        m.role === "user" &&
        Array.isArray(m.content) &&
        (m.content as Array<{ type?: string }>).some((b) => b.type === "tool_result"),
    );
    expect(toolResultMsg).toBeDefined();
    const blocks = toolResultMsg?.content as Array<{ type: string; tool_use_id?: string }>;
    expect(blocks.some((b) => b.type === "tool_result" && b.tool_use_id === "toolu_01")).toBe(
      true,
    );
  });
});
