import { statSync } from "node:fs";
import { basename, isAbsolute } from "node:path";
import {
  discoverSkills,
  loadFullSkillBody,
  selectSkills,
  type SkillFile,
} from "@wanwu/skills";

export {
  discoverSkills,
  loadFullSkillBody,
  renderSkillCatalog,
  renderSkillsForPrompt,
  selectSkills,
  type SkillFile,
  type SkillSource,
} from "@wanwu/skills";

const MAX_PROMPT_SKILLS = 8;
const MAX_PREVIEW = 2000;

function pushSkill(out: SkillFile[], skill: SkillFile): void {
  if (out.some((s) => s.id === skill.id || s.path === skill.path)) return;
  out.push(skill);
}

function firstSummary(body: string): string {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("---")) continue;
    if (/^(name|description|license|metadata|author|version):/i.test(line)) continue;
    return line.replace(/^#+\s*/, "").replace(/^["']|["']$/g, "").slice(0, 80);
  }
  return "";
}

/** `[SKILLS=a,b]` → explicit list; missing tag → undefined (use workspace default). */
export function parseAttachedSkillIds(prompt: string): string[] | undefined {
  const m = prompt.match(/\[SKILLS=([^\]]*)\]/);
  if (!m) return undefined;
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const SKILL_IMPORT =
  /\[SKILL_IMPORT\s+name="([A-Za-z0-9._\-\u4e00-\u9fff]{1,48})"\]\n([\s\S]*?)\n\[\/SKILL_IMPORT\]/g;

/** Absolute markdown paths the shell attached via the file picker. */
export function parseSkillFilePaths(prompt: string): string[] {
  const out: string[] = [];
  for (const m of prompt.matchAll(/\[SKILLFILE=([^\]]+)\]/g)) {
    const abs = m[1]?.trim() ?? "";
    if (!abs || abs.includes("\n") || !isAbsolute(abs)) continue;
    if (!/\.(md|markdown)$/i.test(abs)) continue;
    if (!out.includes(abs)) out.push(abs);
    if (out.length >= 4) break;
  }
  return out;
}

/** Unsaved drafts embedded by the shell. */
export function parseSkillImports(prompt: string): SkillFile[] {
  const out: SkillFile[] = [];
  for (const m of prompt.matchAll(new RegExp(SKILL_IMPORT.source, "g"))) {
    const name = m[1] ?? "";
    const preview = (m[2] ?? "").slice(0, MAX_PREVIEW);
    if (!name || !preview.trim()) continue;
    pushSkill(out, {
      id: `file/${name}`,
      name,
      path: "",
      source: "file",
      preview,
      summary: firstSummary(preview) || name,
      description: firstSummary(preview) || name,
    });
    if (out.length >= 4) break;
  }
  return out;
}

function readExternalSkill(absPath: string): SkillFile | undefined {
  try {
    const st = statSync(absPath);
    if (!st.isFile() || st.size > 64 * 1024) return undefined;
  } catch {
    return undefined;
  }
  const body = loadFullSkillBody(absPath).slice(0, MAX_PREVIEW);
  if (!body.trim()) return undefined;
  const stem = basename(absPath).replace(/\.(md|markdown)$/i, "") || "skill";
  const summary = firstSummary(body) || stem;
  return {
    id: `file/${stem}`,
    name: stem,
    path: absPath,
    source: "file",
    preview: body,
    summary,
    description: summary,
  };
}

export function stripSkillTags(text: string): string {
  return text
    .replace(/\[SKILL_IMPORT\s+name="[^"]*"\]\n[\s\S]*?\n\[\/SKILL_IMPORT\]\n?/g, "")
    .replace(/\[SKILLFILE=[^\]]*\]\n?/g, "")
    .replace(/\[SKILLS=[^\]]*\]\n?/g, "");
}

export function resolvePromptSkills(cwd: string, prompt: string): SkillFile[] {
  const all = discoverSkills(cwd);
  const attached = parseAttachedSkillIds(prompt);
  const base =
    attached === undefined
      ? all.filter((s) => s.source === "workspace").slice(0, MAX_PROMPT_SKILLS)
      : selectSkills(all, attached);
  const extra = [
    ...parseSkillFilePaths(prompt).flatMap((p) => {
      const skill = readExternalSkill(p);
      return skill ? [skill] : [];
    }),
    ...parseSkillImports(prompt),
  ];
  for (const skill of extra) pushSkill(base, skill);
  return base.slice(0, MAX_PROMPT_SKILLS);
}