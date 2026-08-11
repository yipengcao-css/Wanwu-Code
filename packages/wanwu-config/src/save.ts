import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { stringify as stringifyToml } from "smol-toml";
import { loadTomlFile, userConfigPath } from "./load.js";
import { DEFAULT_CONFIG, mergeConfig, type ProviderId, type WanwuConfig } from "./index.js";

export interface UserSettingsPatch {
  activeProvider?: ProviderId;
  model?: string;
  /** OpenAI-compatible / custom base URL */
  baseUrl?: string;
}

export interface CredentialPatch {
  /** Raw API key; never written into config.toml */
  apiKey?: string;
  /** Env var name that providers should read (default OPENAI_API_KEY for openai) */
  apiKeyEnv?: string;
}

function credentialsPath(): string {
  return join(homedir(), ".wanwu", "credentials.env");
}

/** Write/merge `~/.wanwu/config.toml` (no secrets). */
export function saveUserConfig(patch: UserSettingsPatch): string {
  const path = userConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  const existing = loadTomlFile(path) ?? {};
  const merged = mergeConfig(DEFAULT_CONFIG, existing);
  const next: WanwuConfig = {
    ...merged,
    activeProvider: patch.activeProvider ?? merged.activeProvider,
    model: patch.model?.trim() || merged.model,
    providers: { ...merged.providers },
  };
  if (patch.baseUrl !== undefined) {
    const id = next.activeProvider;
    next.providers[id] = {
      ...next.providers[id],
      baseUrl: patch.baseUrl.trim(),
    };
  }

  const doc: Record<string, unknown> = {
    active_provider: next.activeProvider,
    model: next.model,
    permission_mode: next.permissionMode,
    sandbox: next.sandbox,
    acp_backend: next.acpBackend,
    default_mode: next.defaultMode,
    providers: {} as Record<string, Record<string, string>>,
  };
  const providersOut = doc.providers as Record<string, Record<string, string>>;
  for (const [id, p] of Object.entries(next.providers)) {
    if (!p) continue;
    const row: Record<string, string> = {};
    if (p.apiKeyEnv) row.api_key_env = p.apiKeyEnv;
    if (p.baseUrl) row.base_url = p.baseUrl;
    if (p.defaultModel) row.default_model = p.defaultModel;
    if (Object.keys(row).length) providersOut[id] = row;
  }

  writeFileSync(path, `${stringifyToml(doc)}\n`, "utf8");
  try {
    chmodSync(path, 0o600);
  } catch {
    /* ignore on platforms without chmod semantics */
  }
  return path;
}

/** Persist API key into `~/.wanwu/credentials.env` (0600). Not committed to any repo. */
export function saveUserCredentials(patch: CredentialPatch, provider: ProviderId = "openai"): string {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true });
  const envName =
    patch.apiKeyEnv?.trim() ||
    (provider === "anthropic"
      ? "ANTHROPIC_API_KEY"
      : provider === "xai"
        ? "XAI_API_KEY"
        : provider === "custom"
          ? "WANWU_API_KEY"
          : "OPENAI_API_KEY");

  const map = new Map<string, string>();
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      map.set(m[1]!, m[2]!.replace(/^["']|["']$/g, ""));
    }
  }
  if (patch.apiKey !== undefined) {
    if (patch.apiKey.trim()) map.set(envName, patch.apiKey.trim());
    else map.delete(envName);
  }

  const body = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("\n") + (map.size ? "\n" : "");
  writeFileSync(path, body, "utf8");
  try {
    chmodSync(path, 0o600);
  } catch {
    /* ignore */
  }
  return path;
}

/** Load credentials.env into a plain object (for spawning ACP with env). */
export function loadUserCredentials(): Record<string, string> {
  const path = credentialsPath();
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}

export function hasStoredCredential(provider: ProviderId): boolean {
  const creds = loadUserCredentials();
  const config = mergeConfig(DEFAULT_CONFIG, loadTomlFile(userConfigPath()));
  const envName =
    config.providers[provider]?.apiKeyEnv ||
    (provider === "anthropic"
      ? "ANTHROPIC_API_KEY"
      : provider === "xai"
        ? "XAI_API_KEY"
        : provider === "custom"
          ? "WANWU_API_KEY"
          : "OPENAI_API_KEY");
  return Boolean(process.env[envName]?.trim() || creds[envName]?.trim());
}
