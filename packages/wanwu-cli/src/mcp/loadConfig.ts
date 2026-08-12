import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { McpServerConfig } from "./types.js";

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

function normalizeServer(name: string, raw: Record<string, unknown>): McpServerConfig | undefined {
  const command = asString(raw.command);
  if (!command) return undefined;
  return {
    name,
    command,
    args: asStringArray(raw.args),
    env: asEnv(raw.env),
  };
}

/** Cursor-style `.mcp.json` / `.wanwu/mcp.json`: `{ "mcpServers": { name: { command, args } } }` */
function parseMcpJson(text: string): McpServerConfig[] {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const block =
    (parsed.mcpServers as Record<string, unknown> | undefined) ??
    (parsed.servers as Record<string, unknown> | undefined) ??
    {};
  const out: McpServerConfig[] = [];
  for (const [name, value] of Object.entries(block)) {
    if (!value || typeof value !== "object") continue;
    const s = normalizeServer(name, value as Record<string, unknown>);
    if (s) out.push(s);
  }
  return out;
}

/** PLAN-style toml: `[mcp.servers.name] command=... args=[...]` or top-level `[servers.name]` */
function parseMcpToml(text: string): McpServerConfig[] {
  const parsed = parseToml(text) as Record<string, unknown>;
  const mcp = (parsed.mcp as Record<string, unknown> | undefined) ?? {};
  const servers =
    (mcp.servers as Record<string, unknown> | undefined) ??
    (parsed.servers as Record<string, unknown> | undefined) ??
    {};
  const out: McpServerConfig[] = [];
  for (const [name, value] of Object.entries(servers)) {
    if (!value || typeof value !== "object") continue;
    const s = normalizeServer(name, value as Record<string, unknown>);
    if (s) out.push(s);
  }
  return out;
}

export function mcpConfigCandidates(cwd: string): string[] {
  return [join(cwd, ".wanwu", "mcp.toml"), join(cwd, ".wanwu", "mcp.json"), join(cwd, ".mcp.json")];
}

/**
 * Load MCP server definitions from the first existing config file.
 * Later files are ignored (first-wins) to keep behavior predictable.
 */
export function loadMcpServers(cwd: string): { servers: McpServerConfig[]; source?: string } {
  for (const path of mcpConfigCandidates(cwd)) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const servers = path.endsWith(".toml") ? parseMcpToml(text) : parseMcpJson(text);
    return { servers, source: path };
  }
  return { servers: [] };
}

export function qualifyMcpTool(server: string, tool: string): string {
  const safeServer = server.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeTool = tool.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `mcp__${safeServer}__${safeTool}`;
}

export function parseQualifiedMcpTool(
  name: string,
): { server: string; tool: string } | undefined {
  if (!name.startsWith("mcp__")) return undefined;
  // server/tool may contain underscores; split on first __ after mcp__
  const rest = name.slice("mcp__".length);
  const idx = rest.indexOf("__");
  if (idx <= 0) return undefined;
  const server = rest.slice(0, idx);
  const tool = rest.slice(idx + 2);
  if (!server || !tool) return undefined;
  return { server, tool };
}
