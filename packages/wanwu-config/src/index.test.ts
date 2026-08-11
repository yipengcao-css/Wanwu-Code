import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  listConfiguredProviders,
  mergeConfig,
  resolveActiveModel,
} from "./index.js";

describe("wanwu-config", () => {
  it("keeps multi-model providers in the default config", () => {
    const providers = listConfiguredProviders(DEFAULT_CONFIG);
    expect(providers).toEqual(["anthropic", "custom", "ollama", "openai", "xai"]);
  });

  it("merges workspace overlay without dropping other providers", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "anthropic",
      model: "claude-sonnet-4",
      providers: {
        anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY", defaultModel: "claude-sonnet-4" },
      },
    });
    expect(merged.activeProvider).toBe("anthropic");
    expect(merged.providers.openai?.apiKeyEnv).toBe("OPENAI_API_KEY");
    expect(resolveActiveModel(merged)).toBe("claude-sonnet-4");
  });

  it("defaults acp backend to wanwu-native", () => {
    expect(DEFAULT_CONFIG.acpBackend).toBe("wanwu-native");
  });
});