import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { LspServerDef } from "./types.js";

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asEnv(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeServer(id: string, raw: Record<string, unknown>): LspServerDef | undefined {
  const command = asString(raw.command);
  if (!command) return undefined;
  const languages = asStringArray(raw.languages);
  if (!languages.length) return undefined;
  return {
    id,
    command,
    args: asStringArray(raw.args),
    languages,
    env: asEnv(raw.env),
    optIn: raw.optIn === true,
  };
}

/** `.wanwu/lsp.json`: `{ "servers": { id: { command, args, languages } } }` */
function parseLspJson(text: string): LspServerDef[] {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const block = (parsed.servers as Record<string, unknown> | undefined) ?? {};
  const out: LspServerDef[] = [];
  for (const [id, value] of Object.entries(block)) {
    if (!value || typeof value !== "object") continue;
    const s = normalizeServer(id, value as Record<string, unknown>);
    if (s) out.push(s);
  }
  return out;
}

/** `.wanwu/lsp.toml`: `[servers.id] command=... args=[...] languages=[...]` */
function parseLspToml(text: string): LspServerDef[] {
  const parsed = parseToml(text) as Record<string, unknown>;
  const servers = (parsed.servers as Record<string, unknown> | undefined) ?? {};
  const out: LspServerDef[] = [];
  for (const [id, value] of Object.entries(servers)) {
    if (!value || typeof value !== "object") continue;
    const s = normalizeServer(id, value as Record<string, unknown>);
    if (s) out.push(s);
  }
  return out;
}

export function lspConfigCandidates(cwd: string): string[] {
  return [join(cwd, ".wanwu", "lsp.toml"), join(cwd, ".wanwu", "lsp.json")];
}

/**
 * Load workspace LSP server overrides.
 * Workspace servers are merged with built-ins by id (workspace wins).
 */
export function loadLspServers(cwd: string): { servers: LspServerDef[]; source?: string } {
  for (const path of lspConfigCandidates(cwd)) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const servers = path.endsWith(".toml") ? parseLspToml(text) : parseLspJson(text);
    return { servers, source: path };
  }
  return { servers: [] };
}
