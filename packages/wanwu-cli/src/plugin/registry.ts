import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { PluginManifest, PluginRegistryIndex } from "./types.js";

const DEFAULT_REGISTRY = "https://registry.wanwu.dev/plugins/index.json";

export function registryUrl(override?: string): string {
  return override ?? process.env.WANWU_PLUGIN_REGISTRY ?? DEFAULT_REGISTRY;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function verifySha256(text: string, expected?: string): boolean {
  if (!expected) return true;
  return sha256Hex(text) === expected.toLowerCase();
}

export function parseRegistryIndex(text: string): PluginRegistryIndex {
  const parsed = JSON.parse(text) as PluginRegistryIndex;
  if (typeof parsed.schemaVersion !== "number" || !Array.isArray(parsed.plugins)) {
    throw new Error("invalid registry index schema");
  }
  return parsed;
}

export async function fetchRegistry(
  url?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PluginRegistryIndex> {
  const target = registryUrl(url);
  if (target.startsWith("file://")) {
    const path = target.slice("file://".length);
    if (!existsSync(path)) throw new Error(`registry not found: ${path}`);
    return parseRegistryIndex(readFileSync(path, "utf8"));
  }
  const res = await fetchImpl(target);
  if (!res.ok) throw new Error(`registry fetch failed: ${res.status}`);
  return parseRegistryIndex(await res.text());
}

export function findPlugin(
  index: PluginRegistryIndex,
  id: string,
  version?: string,
): PluginManifest | undefined {
  return index.plugins.find(
    (p) => p.id === id && (!version || p.version === version),
  );
}
