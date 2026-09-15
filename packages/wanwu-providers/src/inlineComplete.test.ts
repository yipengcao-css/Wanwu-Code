import { describe, expect, it } from "vitest";
import type { WanwuConfig } from "@wanwu/config";
import { completeInline, sanitizeCompletion } from "./inlineComplete.js";

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

const env = { OPENAI_API_KEY: "sk-test" } as NodeJS.ProcessEnv;

describe("sanitizeCompletion", () => {
  it("strips markdown fences", () => {
    expect(sanitizeCompletion("```ts\nconst x = 1;\n```")).toBe("const x = 1;");
  });
  it("preserves leading indentation (meaningful at cursor)", () => {
    expect(sanitizeCompletion("```ts\n  return a + b;\n```")).toBe("  return a + b;");
  });
  it("trims trailing whitespace", () => {
    expect(sanitizeCompletion("const x = 1;  \n\n")).toBe("const x = 1;");
  });
  it("passes plain text through", () => {
    expect(sanitizeCompletion("return 42;")).toBe("return 42;");
  });
});

describe("completeInline", () => {
  it("chat fallback sends prefix/suffix contract and sanitizes", async () => {
    let seenBody = "";
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      seenBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          id: "r",
          object: "chat.completion",
          created: 0,
          model: "fixture",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "```ts\n  return a + b;\n```" },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const r = await completeInline({
      config: baseConfig,
      prefix: "function add(a, b) {",
      suffix: "}",
      language: "typescript",
      fetchImpl,
      env,
    });
    expect(r.text).toBe("  return a + b;");
    expect(seenBody).toContain("<prefix>");
    expect(seenBody).toContain("function add(a, b) {");
    expect(seenBody).toContain("<suffix>");
  });

  it("FIM path posts prompt/suffix to /completions", async () => {
    let seenUrl = "";
    let seenBody = "";
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seenUrl = String(url);
      seenBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({ choices: [{ text: " a + b " }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const config: WanwuConfig = {
      ...baseConfig,
      providers: {
        openai: {
          apiKeyEnv: "OPENAI_API_KEY",
          baseUrl: "https://fixture.local/v1",
          defaultModel: "fixture",
          fim: true,
          completionModel: "fim-model",
        },
      },
    };
    const r = await completeInline({
      config,
      prefix: "function add(a, b) { return",
      suffix: "; }",
      fetchImpl,
      env,
    });
    expect(r.text).toBe(" a + b ");
    expect(r.model).toBe("fim-model");
    expect(seenUrl).toBe("https://fixture.local/v1/completions");
    expect(seenBody).toContain('"suffix"');
    expect(seenBody).toContain("fim-model");
  });
});
