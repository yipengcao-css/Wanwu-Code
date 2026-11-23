export type ProviderId = "xai" | "openai" | "anthropic" | "ollama" | "custom";
export type AcpBackend = "grok" | "wanwu-native";
export type WanwuMode = "ask" | "plan" | "agent" | "verify" | "debug";
export type PermissionMode = "ask" | "accept-edits" | "accept-all";
export type SandboxMode = "off" | "workspace" | "strict";

export interface ProviderConfig {
  apiKeyEnv?: string;
  baseUrl?: string;
  defaultModel?: string;
  /** Embedding model for codebase indexing (OpenAI-compat /embeddings). */
  embeddingModel?: string;
  /** Use FIM /completions for inline completion (DeepSeek/Codestral style). */
  fim?: boolean;
  /** Dedicated model for inline completion (defaults to chat model). */
  completionModel?: string;
  /** Fast model that turns an edit intent into exact search/replace hunks. */
  applyModel?: string;
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

/** Fresh install: no product-chosen provider/model — users configure BYOK in Shell or config.toml. */
export const DEFAULT_CONFIG: WanwuConfig = {
  activeProvider: "custom",
  model: "",
  permissionMode: "ask",
  sandbox: "workspace",
  acpBackend: "wanwu-native",
  defaultMode: "agent",
  providers: {
    xai: { apiKeyEnv: "XAI_API_KEY" },
    openai: { apiKeyEnv: "OPENAI_API_KEY" },
    anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY" },
    ollama: {},
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
  const explicit = config.model?.trim();
  if (explicit) return explicit;
  const fallback = config.providers[config.activeProvider]?.defaultModel?.trim();
  return fallback ?? "";
}

export function listConfiguredProviders(config: WanwuConfig): ProviderId[] {
  return (Object.keys(config.providers) as ProviderId[]).sort();
}

export {
  loadTomlFile,
  loadWanwuConfig,
  userConfigPath,
  type LoadedConfig,
} from "./load.js";

export {
  saveUserConfig,
  saveUserCredentials,
  loadUserCredentials,
  hasStoredCredential,
  type UserSettingsPatch,
  type CredentialPatch,
} from "./save.js";