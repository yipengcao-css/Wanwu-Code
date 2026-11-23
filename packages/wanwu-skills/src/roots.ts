import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const DEFAULT_PACK_ID = "azure-ops";

/** User install target: `~/.wanwu/skill-packs/<packId>/`. */
export function userSkillPackRoot(home = homedir(), packId = DEFAULT_PACK_ID): string {
  return join(home, ".wanwu", "skill-packs", packId);
}

export function userSkillPacksDir(home = homedir()): string {
  return join(home, ".wanwu", "skill-packs");
}

/** Resolve active pack root from env or default user install. */
export function resolveSkillsRoot(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const explicit = env.WANWU_SKILLS_ROOT?.trim();
  if (explicit) return resolve(explicit);
  const def = userSkillPackRoot(home);
  if (existsSync(def)) return def;
  return def;
}

/** All directories agent Read/Write may access outside the workspace (skill packs). */
export function listSkillSandboxRoots(env: NodeJS.ProcessEnv = process.env, home = homedir()): string[] {
  const roots = new Set<string>();
  const push = (p: string | undefined) => {
    const r = p?.trim();
    if (!r) return;
    roots.add(resolve(r));
  };
  push(env.WANWU_SKILLS_ROOT);
  push(env.WANWU_SKILL_PACKS);
  const packsDir = userSkillPacksDir(home);
  if (existsSync(packsDir)) roots.add(resolve(packsDir));
  push(userSkillPackRoot(home));
  return [...roots];
}

export function skillPackEnv(home = homedir(), packId = DEFAULT_PACK_ID): Record<string, string> {
  const root = userSkillPackRoot(home, packId);
  return {
    WANWU_SKILLS_ROOT: root,
    WANWU_SKILL_PACKS: userSkillPacksDir(home),
  };
}