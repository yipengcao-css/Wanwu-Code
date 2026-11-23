import { discoverSkills, type SkillFile } from "@wanwu/skills";
import { homedir } from "node:os";

export type ShellSkill = {
  id: string;
  name: string;
  source: SkillFile["source"];
  summary: string;
};

export function listWorkspaceSkills(root: string | null, userHome = homedir()): ShellSkill[] {
  const cwd = root ?? userHome;
  return discoverSkills(cwd, { userHome, limit: 64 }).map((s) => ({
    id: s.id,
    name: s.name,
    source: s.source,
    summary: s.summary,
  }));
}