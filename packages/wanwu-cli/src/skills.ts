import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface SkillFile {
  name: string;
  path: string;
  /** First ~2000 chars of the skill body for prompt injection. */
  preview: string;
}

const MAX_SKILLS = 6;
const MAX_PREVIEW = 2000;

/**
 * Discover .wanwu/skills/*.md|*.toml and return prompt-ready previews.
 * Skills are plain markdown instructions; we do not execute frontmatter.
 */
export function discoverSkills(cwd: string): SkillFile[] {
  const dir = join(cwd, ".wanwu", "skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".md") || n.endsWith(".toml"))
    .slice(0, MAX_SKILLS)
    .map((name) => {
      const path = join(dir, name);
      let preview = "";
      try {
        preview = readFileSync(path, "utf8").slice(0, MAX_PREVIEW);
      } catch {
        preview = "";
      }
      return { name, path, preview };
    })
    .filter((s) => s.preview.trim().length > 0);
}

export function renderSkillsForPrompt(skills: SkillFile[]): string {
  if (!skills.length) return "";
  return skills
    .map((s) => `# Skill: ${s.name}\n${s.preview}`)
    .join("\n\n---\n\n");
}
