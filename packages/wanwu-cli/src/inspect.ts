import { loadWanwuConfig } from "@wanwu/config";
import { discoverMcpConfig, discoverSkills } from "./discover.js";
import { loadHooks } from "./hooks.js";
import { discoverMemory } from "./memory.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export function runInspect(cwd: string = findWorkspaceRoot()): void {
  const { config, sources } = loadWanwuConfig(cwd);
  const memory = discoverMemory(cwd);
  const skills = discoverSkills(cwd);
  const hooks = loadHooks(cwd);
  const mcp = discoverMcpConfig(cwd);

  const report = {
    sources,
    config,
    memory: memory.map((m) => ({ kind: m.kind, path: m.path })),
    skills,
    hooks,
    mcp,
    skillsDir: `${cwd}/.wanwu/skills`,
    hooksDir: `${cwd}/.wanwu/hooks`,
  };

  console.log(JSON.stringify(report, null, 2));
}