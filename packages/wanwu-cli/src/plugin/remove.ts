import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { removeInstalled, workspaceMcpPath, workspaceSkillsDir } from "./cache.js";

export interface RemoveOptions {
  cwd: string;
  scope?: "user" | "workspace";
}

export function removePlugin(id: string, opts: RemoveOptions): boolean {
  let removed = false;

  // Remove workspace skill file
  const skillPath = join(workspaceSkillsDir(opts.cwd), `${id}.md`);
  if (existsSync(skillPath)) {
    rmSync(skillPath, { force: true });
    removed = true;
  }

  // Remove MCP entry from workspace mcp.toml
  const mcpPath = workspaceMcpPath(opts.cwd);
  if (existsSync(mcpPath)) {
    const parsed = parseToml(readFileSync(mcpPath, "utf8")) as Record<string, unknown>;
    const mcp = parsed.mcp as Record<string, unknown> | undefined;
    const servers = mcp?.servers as Record<string, unknown> | undefined;
    if (servers && id in servers) {
      delete servers[id];
      writeFileSync(mcpPath, stringifyToml(parsed), "utf8");
      removed = true;
    }
  }

  // Remove installed record
  if (removeInstalled(id, opts.scope)) {
    removed = true;
  }

  return removed;
}
