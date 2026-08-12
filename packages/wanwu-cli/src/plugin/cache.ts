import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { InstalledPlugin } from "./types.js";

export function userPluginsRoot(): string {
  return join(homedir(), ".wanwu", "plugins");
}

export function userPluginsCacheDir(): string {
  return join(userPluginsRoot(), "cache");
}

export function userPluginsIndexPath(): string {
  return join(userPluginsRoot(), "installed.json");
}

export function userMcpFragmentsDir(): string {
  return join(homedir(), ".wanwu", "mcp.d");
}

export function workspaceSkillsDir(cwd: string): string {
  return join(cwd, ".wanwu", "skills");
}

export function workspaceMcpPath(cwd: string): string {
  return join(cwd, ".wanwu", "mcp.toml");
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function readInstalled(): InstalledPlugin[] {
  const path = userPluginsIndexPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as InstalledPlugin[];
  } catch {
    return [];
  }
}

export function writeInstalled(plugins: InstalledPlugin[]): void {
  ensureDir(userPluginsRoot());
  writeFileSync(userPluginsIndexPath(), JSON.stringify(plugins, null, 2), "utf8");
}

export function upsertInstalled(plugin: InstalledPlugin): void {
  const all = readInstalled().filter((p) => !(p.id === plugin.id && p.scope === plugin.scope));
  all.push(plugin);
  writeInstalled(all);
}

export function removeInstalled(id: string, scope?: "user" | "workspace"): boolean {
  const all = readInstalled();
  const next = all.filter((p) => !(p.id === id && (!scope || p.scope === scope)));
  if (next.length === all.length) return false;
  writeInstalled(next);
  return true;
}
