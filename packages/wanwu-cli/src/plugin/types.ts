export type PluginKind = "skill" | "mcp";
export type PluginTrust = "official" | "community" | "local" | "untrusted";

export interface PluginSource {
  type: "https" | "inline-config" | "local";
  url?: string;
  sha256?: string;
}

export interface PluginMcpConfig {
  command: string;
  args: string[];
  envKeys?: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  kind: PluginKind;
  version: string;
  trust: PluginTrust;
  description?: string;
  license?: string;
  source: PluginSource;
  mcp?: PluginMcpConfig;
}

export interface PluginRegistryIndex {
  schemaVersion: number;
  updatedAt?: string;
  plugins: PluginManifest[];
}

export interface InstalledPlugin {
  id: string;
  version: string;
  kind: PluginKind;
  trust: PluginTrust;
  sha256?: string;
  scope: "user" | "workspace";
  enabled: boolean;
  installedAt: string;
  path?: string;
}
