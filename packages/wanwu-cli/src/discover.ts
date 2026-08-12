import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mcpConfigCandidates } from "./mcp/loadConfig.js";

export function discoverSkills(cwd: string): string[] {
  const dir = join(cwd, ".wanwu", "skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith(".md") || n.endsWith(".toml"));
}

export function discoverMcpConfig(cwd: string): string[] {
  return mcpConfigCandidates(cwd).filter((p) => existsSync(p));
}
