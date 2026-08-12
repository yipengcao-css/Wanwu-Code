import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import {
  ensureDir,
  upsertInstalled,
  userPluginsCacheDir,
  workspaceMcpPath,
  workspaceSkillsDir,
} from "./cache.js";
import { sha256Hex, verifySha256 } from "./registry.js";
import type { InstalledPlugin, PluginManifest } from "./types.js";

export interface InstallOptions {
  cwd: string;
  scope: "user" | "workspace";
  yes?: boolean;
  fetchImpl?: typeof fetch;
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<string> {
  if (url.startsWith("file://")) {
    return readFileSync(url.slice("file://".length), "utf8");
  }
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.text();
}

function cachePathFor(content: string): string {
  const hash = sha256Hex(content);
  return join(userPluginsCacheDir(), `sha256-${hash}`);
}

function installSkillText(
  manifest: PluginManifest,
  content: string,
  opts: InstallOptions,
): string {
  if (!verifySha256(content, manifest.source.sha256)) {
    throw new Error(`sha256 mismatch for ${manifest.id}`);
  }
  const cacheDir = cachePathFor(content);
  ensureDir(cacheDir);
  const cacheFile = join(cacheDir, "skill.md");
  writeFileSync(cacheFile, content, "utf8");

  if (opts.scope === "workspace") {
    const dir = workspaceSkillsDir(opts.cwd);
    ensureDir(dir);
    const target = join(dir, `${manifest.id}.md`);
    copyFileSync(cacheFile, target);
    return target;
  }
  return cacheFile;
}

function installMcpConfig(manifest: PluginManifest, opts: InstallOptions): string {
  if (!manifest.mcp) throw new Error(`mcp plugin missing config: ${manifest.id}`);
  const path = workspaceMcpPath(opts.cwd);
  ensureDir(dirname(path));

  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    existing = parseToml(readFileSync(path, "utf8")) as Record<string, unknown>;
  }
  const mcp = (existing.mcp as Record<string, unknown> | undefined) ?? {};
  const servers = (mcp.servers as Record<string, unknown> | undefined) ?? {};
  servers[manifest.id] = {
    command: manifest.mcp.command,
    args: manifest.mcp.args,
  };
  mcp.servers = servers;
  existing.mcp = mcp;
  writeFileSync(path, stringifyToml(existing), "utf8");
  return path;
}

/**
 * Install a plugin manifest.
 * Skills are copied as text; MCP plugins only write config (no process spawn).
 */
export async function installPlugin(
  manifest: PluginManifest,
  opts: InstallOptions,
): Promise<InstalledPlugin> {
  let path: string | undefined;
  let sha256: string | undefined;

  if (manifest.kind === "skill") {
    if (!manifest.source.url) throw new Error(`skill plugin missing url: ${manifest.id}`);
    const content = await fetchText(manifest.source.url, opts.fetchImpl ?? fetch);
    sha256 = sha256Hex(content);
    path = installSkillText(manifest, content, opts);
  } else if (manifest.kind === "mcp") {
    path = installMcpConfig(manifest, opts);
    sha256 = manifest.source.sha256;
  } else {
    throw new Error(`unsupported plugin kind: ${manifest.kind}`);
  }

  const record: InstalledPlugin = {
    id: manifest.id,
    version: manifest.version,
    kind: manifest.kind,
    trust: manifest.trust,
    sha256,
    scope: opts.scope,
    enabled: true,
    installedAt: new Date().toISOString(),
    path,
  };
  upsertInstalled(record);
  return record;
}
