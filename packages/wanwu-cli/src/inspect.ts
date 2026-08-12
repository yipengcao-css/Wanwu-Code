import { loadWanwuConfig } from "@wanwu/config";
import { discoverMcpConfig, discoverSkills } from "./discover.js";
import { loadHooks } from "./hooks.js";
import { loadMcpServers } from "./mcp/loadConfig.js";
import { discoverMemory } from "./memory.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export function runInspect(cwd: string = findWorkspaceRoot()): void {
  const { config, sources } = loadWanwuConfig(cwd);
  const memory = discoverMemory(cwd);
  const skills = discoverSkills(cwd);
  const hooks = loadHooks(cwd);
  const mcpPaths = discoverMcpConfig(cwd);
  const mcpLoaded = loadMcpServers(cwd);

  const report = {
    sources,
    config,
    memory: memory.map((m) => ({ kind: m.kind, path: m.path })),
    skills,
    hooks,
    mcp: mcpPaths,
    mcpServers: mcpLoaded.servers.map((s) => ({
      name: s.name,
      command: s.command,
      args: s.args,
      source: mcpLoaded.source,
    })),
    skillsDir: `${cwd}/.wanwu/skills`,
    hooksDir: `${cwd}/.wanwu/hooks`,
  };

  console.log(JSON.stringify(report, null, 2));
}
