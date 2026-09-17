import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";

export type ProviderId = "xai" | "openai" | "anthropic" | "ollama" | "custom";

/** Which agent runtime backs the Agent panel. */
export type AgentBackend = "wanwu-native" | "grok";

export interface WanwuSettings {
  activeProvider: ProviderId;
  model: string;
  baseUrl: string;
  fontSize: number;
  /** Command run by Verify mode (in-app test/lint runner). */
  verifyCommand: string;
  /** Underlying agent runtime: bundled wanwu-native, or the open-source grok CLI. */
  agentBackend: AgentBackend;
  /** Command line used to launch grok's ACP stdio server (when agentBackend=grok). */
  grokCommand: string;
  /** Per-provider API keys, stored encrypted (safeStorage) when available. */
  apiKeys: Partial<Record<ProviderId, string>>;
}

/** What the renderer receives — never the raw secrets, only whether they are set. */
export interface SettingsView {
  activeProvider: ProviderId;
  model: string;
  baseUrl: string;
  fontSize: number;
  verifyCommand: string;
  agentBackend: AgentBackend;
  grokCommand: string;
  apiKeysSet: Partial<Record<ProviderId, boolean>>;
}

export interface SettingsPatch {
  activeProvider?: ProviderId;
  model?: string;
  baseUrl?: string;
  fontSize?: number;
  verifyCommand?: string;
  agentBackend?: AgentBackend;
  grokCommand?: string;
  /** Empty string = leave unchanged; non-empty = set new key. */
  apiKeys?: Partial<Record<ProviderId, string>>;
}

const API_KEY_ENV: Record<ProviderId, string | undefined> = {
  openai: "OPENAI_API_KEY",
  xai: "XAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  custom: "WANWU_API_KEY",
  ollama: undefined,
};

const DEFAULTS: WanwuSettings = {
  activeProvider: "openai",
  model: "",
  baseUrl: "",
  fontSize: 13,
  verifyCommand: "pnpm test",
  agentBackend: "wanwu-native",
  grokCommand: "grok acp",
  apiKeys: {},
};

function settingsPath(): string {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return join(dir, "settings.json");
}

function encrypt(value: string): string {
  if (!value) return "";
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(value).toString("base64")}`;
    }
  } catch {
    /* fall through to plaintext */
  }
  return `raw:${Buffer.from(value, "utf8").toString("base64")}`;
}

function decrypt(stored: string | undefined): string {
  if (!stored) return "";
  try {
    if (stored.startsWith("enc:")) {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), "base64"));
    }
    if (stored.startsWith("raw:")) {
      return Buffer.from(stored.slice(4), "base64").toString("utf8");
    }
  } catch {
    return "";
  }
  return "";
}

let cache: WanwuSettings | undefined;

export function loadSettings(): WanwuSettings {
  if (cache) return cache;
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<WanwuSettings>;
    cache = {
      activeProvider: raw.activeProvider ?? DEFAULTS.activeProvider,
      model: raw.model ?? DEFAULTS.model,
      baseUrl: raw.baseUrl ?? DEFAULTS.baseUrl,
      fontSize: raw.fontSize ?? DEFAULTS.fontSize,
      verifyCommand: raw.verifyCommand ?? DEFAULTS.verifyCommand,
      agentBackend: raw.agentBackend ?? DEFAULTS.agentBackend,
      grokCommand: raw.grokCommand ?? DEFAULTS.grokCommand,
      apiKeys: raw.apiKeys ?? {},
    };
  } catch {
    cache = { ...DEFAULTS, apiKeys: {} };
  }
  return cache;
}

function persist(next: WanwuSettings): void {
  cache = next;
  if (!existsSync(settingsPath())) mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
}

export function getSettingsView(): SettingsView {
  const s = loadSettings();
  const apiKeysSet: Partial<Record<ProviderId, boolean>> = {};
  for (const [k, v] of Object.entries(s.apiKeys)) {
    apiKeysSet[k as ProviderId] = Boolean(v);
  }
  return {
    activeProvider: s.activeProvider,
    model: s.model,
    baseUrl: s.baseUrl,
    fontSize: s.fontSize,
    verifyCommand: s.verifyCommand,
    agentBackend: s.agentBackend,
    grokCommand: s.grokCommand,
    apiKeysSet,
  };
}

export function updateSettings(patch: SettingsPatch): SettingsView {
  const s = loadSettings();
  const next: WanwuSettings = {
    activeProvider: patch.activeProvider ?? s.activeProvider,
    model: patch.model ?? s.model,
    baseUrl: patch.baseUrl ?? s.baseUrl,
    fontSize: patch.fontSize ?? s.fontSize,
    verifyCommand: patch.verifyCommand ?? s.verifyCommand,
    agentBackend: patch.agentBackend ?? s.agentBackend,
    grokCommand: patch.grokCommand ?? s.grokCommand,
    apiKeys: { ...s.apiKeys },
  };
  if (patch.apiKeys) {
    for (const [k, v] of Object.entries(patch.apiKeys)) {
      if (v && v.trim()) next.apiKeys[k as ProviderId] = encrypt(v.trim());
    }
  }
  persist(next);
  return getSettingsView();
}

/** Env vars injected into the ACP backend so it uses the chosen provider/model/key. */
export function agentEnv(): NodeJS.ProcessEnv {
  const s = loadSettings();
  const env: NodeJS.ProcessEnv = { WANWU_PROVIDER: s.activeProvider };
  if (s.model.trim()) env.WANWU_MODEL = s.model.trim();
  const keyEnv = API_KEY_ENV[s.activeProvider];
  const key = decrypt(s.apiKeys[s.activeProvider]);
  if (keyEnv && key) env[keyEnv] = key;
  if (s.baseUrl.trim() && (s.activeProvider === "custom" || s.activeProvider === "ollama")) {
    env.WANWU_PROVIDER_BASE_URL = s.baseUrl.trim();
  }
  return env;
}

export function agentBackendChoice(): AgentBackend {
  return loadSettings().agentBackend;
}

/** grok ACP launch command line (when agentBackend=grok), split into argv. */
export function grokCommandParts(): string[] {
  return (loadSettings().grokCommand || "grok acp").trim().split(/\s+/).filter(Boolean);
}
