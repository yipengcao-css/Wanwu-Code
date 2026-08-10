export type ProviderId = "xai" | "openai" | "anthropic" | "ollama" | "custom";
export type AcpBackend = "grok" | "wanwu-native";
export type WanwuMode = "ask" | "plan" | "agent" | "verify";
export type PermissionMode = "ask" | "accept-edits" | "accept-all";
export type SandboxMode = "off" | "workspace" | "strict";

export interface ProviderConfig {
  apiKeyEnv?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface WanwuConfig {
  activeProvider: ProviderId;
  model: string;
  permissionMode: PermissionMode;
  sandbox: SandboxMode;
  acpBackend: AcpBackend;
  defaultMode: WanwuMode;
  providers: Partial<Record<ProviderId, ProviderConfig>>;
}

export const DEFAULT_CONFIG: WanwuConfig = {
  activeProvider: "openai",
  model: "gpt-5",
  permissionMode: "ask",
  sandbox: "workspace",
  acpBackend: "grok",
  defaultMode: "agent",
  providers: {
    xai: { apiKeyEnv: "XAI_API_KEY", defaultModel: "grok-4" },
    openai: { apiKeyEnv: "OPENAI_API_KEY", defaultModel: "gpt-5" },
    anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY", defaultModel: "claude-sonnet-4" },
    ollama: { baseUrl: "http://127.0.0.1:11434", defaultModel: "llama3.2" },
    custom: { apiKeyEnv: "WANWU_API_KEY", baseUrl: "" },
  },
};

/** Shallow-merge user overlay onto defaults (workspace overrides user later). */
export function mergeConfig(
  base: WanwuConfig,
  overlay: Partial<WanwuConfig> | undefined,
): WanwuConfig {
  if (!overlay) {
    return { ...base, providers: { ...base.providers } };
  }
  return {
    activeProvider: overlay.activeProvider ?? base.activeProvider,
    model: overlay.model ?? base.model,
    permissionMode: overlay.permissionMode ?? base.permissionMode,
    sandbox: overlay.sandbox ?? base.sandbox,
    acpBackend: overlay.acpBackend ?? base.acpBackend,
    defaultMode: overlay.defaultMode ?? base.defaultMode,
    providers: {
      ...base.providers,
      ...overlay.providers,
    },
  };
}

export function resolveActiveModel(config: WanwuConfig): string {
  if (config.model) {
    return config.model;
  }
  return config.providers[config.activeProvider]?.defaultModel ?? "unknown";
}

export function listConfiguredProviders(config: WanwuConfig): ProviderId[] {
  return (Object.keys(config.providers) as ProviderId[]).sort();
}