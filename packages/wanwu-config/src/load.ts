import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import {
  DEFAULT_CONFIG,
  mergeConfig,
  type AcpBackend,
  type PermissionMode,
  type ProviderId,
  type SandboxMode,
  type WanwuConfig,
  type WanwuMode,
} from "./index.js";

export interface LoadedConfig {
  config: WanwuConfig;
  sources: string[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseOverlay(raw: unknown): Partial<WanwuConfig> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  const providersRaw = obj.providers;
  const providers: WanwuConfig["providers"] = {};
  if (providersRaw && typeof providersRaw === "object") {
    for (const [key, value] of Object.entries(providersRaw as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const p = value as Record<string, unknown>;
      providers[key as ProviderId] = {
        apiKeyEnv: asString(p.api_key_env) ?? asString(p.apiKeyEnv),
        baseUrl: asString(p.base_url) ?? asString(p.baseUrl),
        defaultModel: asString(p.default_model) ?? asString(p.defaultModel),
      };
    }
  }

  return {
    activeProvider: (asString(obj.active_provider) ?? asString(obj.activeProvider)) as
      | ProviderId
      | undefined,
    model: asString(obj.model),
    permissionMode: (asString(obj.permission_mode) ?? asString(obj.permissionMode)) as
      | PermissionMode
      | undefined,
    sandbox: asString(obj.sandbox) as SandboxMode | undefined,
    acpBackend: (asString(obj.acp_backend) ?? asString(obj.acpBackend)) as AcpBackend | undefined,
    defaultMode: (asString(obj.default_mode) ?? asString(obj.defaultMode)) as WanwuMode | undefined,
    providers: Object.keys(providers).length > 0 ? providers : undefined,
  };
}

export function loadTomlFile(path: string): Partial<WanwuConfig> | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  const text = readFileSync(path, "utf8");
  const parsed = parseToml(text);
  return parseOverlay(parsed);
}

/** Merge defaults ← ~/.wanwu/config.toml ← <cwd>/.wanwu/settings.toml */
export function loadWanwuConfig(cwd: string = process.cwd()): LoadedConfig {
  const sources: string[] = ["defaults"];
  let config = mergeConfig(DEFAULT_CONFIG, undefined);

  const userPath = join(homedir(), ".wanwu", "config.toml");
  const userOverlay = loadTomlFile(userPath);
  if (userOverlay) {
    config = mergeConfig(config, userOverlay);
    sources.push(userPath);
  }

  const workspacePath = join(cwd, ".wanwu", "settings.toml");
  const workspaceOverlay = loadTomlFile(workspacePath);
  if (workspaceOverlay) {
    config = mergeConfig(config, workspaceOverlay);
    sources.push(workspacePath);
  }

  return { config, sources };
}

export function userConfigPath(): string {
  return join(homedir(), ".wanwu", "config.toml");
}