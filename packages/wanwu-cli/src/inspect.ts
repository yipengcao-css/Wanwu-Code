import { loadWanwuConfig } from "@wanwu/config";
import { discoverMemory } from "./memory.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export function runInspect(cwd: string = findWorkspaceRoot()): void {
  const { config, sources } = loadWanwuConfig(cwd);
  const memory = discoverMemory(cwd);

  const report = {
    sources,
    config,
    memory: memory.map((m) => ({ kind: m.kind, path: m.path })),
    skillsDir: `${cwd}/.wanwu/skills`,
    hooksDir: `${cwd}/.wanwu/hooks`,
    note: "skills/hooks discovery will deepen in Phase 4",
  };

  console.log(JSON.stringify(report, null, 2));
}