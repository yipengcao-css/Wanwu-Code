import { ipcMain } from "electron";
import {
  hasStoredCredential,
  loadUserCredentials,
  loadWanwuConfig,
  saveUserConfig,
  saveUserCredentials,
  type PermissionMode,
  type ProviderId,
  userConfigPath,
} from "@wanwu/config";

export type SettingsSnapshot = {
  activeProvider: ProviderId;
  model: string;
  baseUrl: string;
  permissionMode: PermissionMode;
  hasApiKey: boolean;
  configPath: string;
  sources: string[];
};

export function registerSettingsIpc(getRoot: () => string | null): void {
  ipcMain.handle("settings:get", (): SettingsSnapshot => {
    const cwd = getRoot() ?? process.cwd();
    const { config, sources } = loadWanwuConfig(cwd);
    const provider = config.activeProvider;
    const baseUrl = config.providers[provider]?.baseUrl ?? "";
    return {
      activeProvider: provider,
      model: config.model,
      baseUrl,
      permissionMode: config.permissionMode,
      hasApiKey: hasStoredCredential(provider),
      configPath: userConfigPath(),
      sources,
    };
  });

  ipcMain.handle(
    "settings:save",
    (
      _e,
      patch: {
        activeProvider?: ProviderId;
        model?: string;
        baseUrl?: string;
        apiKey?: string;
        permissionMode?: PermissionMode;
      },
    ): SettingsSnapshot => {
      const provider = patch.activeProvider ?? loadWanwuConfig(getRoot() ?? process.cwd()).config.activeProvider;
      saveUserConfig({
        activeProvider: patch.activeProvider,
        model: patch.model,
        baseUrl: patch.baseUrl,
        permissionMode: patch.permissionMode,
      });
      if (patch.apiKey !== undefined) {
        saveUserCredentials({ apiKey: patch.apiKey }, provider);
      }
      // Return fresh snapshot
      const cwd = getRoot() ?? process.cwd();
      const { config, sources } = loadWanwuConfig(cwd);
      return {
        activeProvider: config.activeProvider,
        model: config.model,
        baseUrl: config.providers[config.activeProvider]?.baseUrl ?? "",
        permissionMode: config.permissionMode,
        hasApiKey: hasStoredCredential(config.activeProvider),
        configPath: userConfigPath(),
        sources,
      };
    },
  );
}

/** Env overlay for ACP child (credentials.env + process.env). */
export function acpCredentialEnv(): Record<string, string> {
  return { ...loadUserCredentials() };
}
