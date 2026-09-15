import { describe, expect, it } from "vitest";
import { completeChat, fetchWithRetry } from "./index.js";
import type { WanwuConfig } from "@wanwu/config";

const baseConfig: WanwuConfig = {
  activeProvider: "openai",
  model: "fixture",
  permissionMode: "ask",
  sandbox: "off",
  acpBackend: "wanwu-native",
  defaultMode: "ask",
  providers: {
    openai: {
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "https://fixture.local/v1",
      defaultModel: "fixture",
    },
  },
} as WanwuConfig;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchWithRetry", () => {
  it("returns immediately on success", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse({ ok: true });
    }) as typeof fetch;
    const res = await fetchWithRetry(fetchImpl, "https://x.local", {}, { retryBaseMs: 1 });
    expect(res.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("retries 429 then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls < 3 ? jsonResponse({ error: "slow down" }, 429) : jsonResponse({ ok: true });
    }) as typeof fetch;
    const res = await fetchWithRetry(fetchImpl, "https://x.local", {}, { retryBaseMs: 1 });
    expect(res.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("does not retry 400", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse({ error: "bad" }, 400);
    }) as typeof fetch;
    const res = await fetchWithRetry(fetchImpl, "https://x.local", {}, { retryBaseMs: 1 });
    expect(res.status).toBe(400);
    expect(calls).toBe(1);
  });

  it("retries network errors up to the limit then throws", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      throw new Error("fetch failed");
    }) as typeof fetch;
    await expect(
      fetchWithRetry(fetchImpl, "https://x.local", {}, { retryBaseMs: 1, retries: 2 }),
    ).rejects.toThrow(/fetch failed/);
    expect(calls).toBe(3); // 1 initial + 2 retries
  });

  it("caller abort does not retry", async () => {
    let calls = 0;
    const ac = new AbortController();
    const fetchImpl = (async () => {
      calls += 1;
      ac.abort();
      throw new Error("aborted");
    }) as typeof fetch;
    await expect(
      fetchWithRetry(fetchImpl, "https://x.local", {}, { retryBaseMs: 1, signal: ac.signal }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe("usage parsing", () => {
  it("parses OpenAI-compat usage", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        id: "r",
        object: "chat.completion",
        created: 0,
        model: "fixture",
        choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
      })) as typeof fetch;
    const res = await completeChat({
      config: baseConfig,
      fetchImpl,
      env: { OPENAI_API_KEY: "sk-test" },
      request: { messages: [{ role: "user", content: "hi" }] },
    });
    expect(res.usage).toEqual({ inputTokens: 11, outputTokens: 7, totalTokens: 18 });
  });

  it("parses Anthropic usage", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        id: "msg",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "hi" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 3 },
      })) as typeof fetch;
    const config: WanwuConfig = {
      ...baseConfig,
      activeProvider: "anthropic",
      providers: {
        anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY", baseUrl: "https://fixture.local", defaultModel: "claude-fixture" },
      },
    } as WanwuConfig;
    const res = await completeChat({
      config,
      fetchImpl,
      env: { ANTHROPIC_API_KEY: "sk-test" },
      request: { messages: [{ role: "user", content: "hi" }] },
    });
    expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 3, totalTokens: 8 });
  });
});

describe("capabilities enforcement", () => {
  it("rejects images for non-vision providers", async () => {
    const config: WanwuConfig = {
      ...baseConfig,
      activeProvider: "ollama",
      providers: {
        ollama: { apiKeyEnv: "OLLAMA_API_KEY", baseUrl: "http://127.0.0.1:11434/v1", defaultModel: "llama" },
      },
    } as WanwuConfig;
    const fetchImpl = (async () => jsonResponse({})) as typeof fetch;
    await expect(
      completeChat({
        config,
        fetchImpl,
        request: {
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "look" },
                {
                  type: "image",
                  source: { kind: "base64", mediaType: "image/png", data: "AAAA" },
                },
              ],
            },
          ],
        },
      }),
    ).rejects.toThrow(/does not support image input/);
  });
});
