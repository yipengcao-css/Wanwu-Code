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
});
