import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function discoverSkills(cwd: string): string[] {
  const dir = join(cwd, ".wanwu", "skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith(".md") || n.endsWith(".toml"));
}

export function discoverMcpConfig(cwd: string): string[] {
  const candidates = [
    join(cwd, ".wanwu", "mcp.toml"),
    join(cwd, ".wanwu", "mcp.json"),
    join(cwd, ".mcp.json"),
  ];
  return candidates.filter((p) => existsSync(p));
}