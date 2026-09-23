import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

export type SkillSource = "workspace" | "agents" | "user" | "file";

export interface SkillFile {
  /** Stable id: `workspace/review`, `agents/frontend-design`, `user/foo`. */
  id: string;
  name: string;
  path: string;
  source: SkillSource;
  /** First ~2000 chars of the skill body for prompt injection. */
  preview: string;
  /** One-line summary for pickers. */
  summary: string;
}

const MAX_PROMPT_SKILLS = 8;
const MAX_LIST = 48;
const MAX_PREVIEW = 2000;

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

function readPreview(path: string): { preview: string; summary: string } | undefined {
  try {
    const preview = readFileSync(path, "utf8").slice(0, MAX_PREVIEW);
    if (!preview.trim()) return undefined;
    return { preview, summary: firstSummary(preview) };
  } catch {
    return undefined;
  }
}

function pushSkill(out: SkillFile[], skill: SkillFile): void {
  if (out.some((s) => s.id === skill.id || s.path === skill.path)) return;
  out.push(skill);
}

function scanFlatDir(dir: string, source: SkillSource): SkillFile[] {
  if (!existsSync(dir)) return [];
  const out: SkillFile[] = [];
  for (const name of readdirSync(dir)) {
    if (!(name.endsWith(".md") || name.endsWith(".toml"))) continue;
    const path = join(dir, name);
    const body = readPreview(path);
    if (!body) continue;
    const stem = name.replace(/\.(md|toml)$/i, "");
    out.push({
      id: `${source}/${stem}`,
      name: stem,
      path,
      source,
      preview: body.preview,
      summary: body.summary || stem,
    });
  }
  return out;
}

function scanAgentSkills(dir: string): SkillFile[] {
  if (!existsSync(dir)) return [];
  const out: SkillFile[] = [];
  for (const name of readdirSync(dir)) {
    const folder = join(dir, name);
    try {
      if (!statSync(folder).isDirectory()) continue;
    } catch {
      continue;
    }
    const path = join(folder, "SKILL.md");
    const body = readPreview(path);
    if (!body) continue;
    out.push({
      id: `agents/${name}`,
      name,
      path,
      source: "agents",
      preview: body.preview,
      summary: body.summary || name,
    });
  }
  return out;
}

/**
 * Discover skill markdown from workspace, `.agents/skills`, and `~/.wanwu/skills`.
 * Skills are plain instructions; we do not execute frontmatter.
 */
export function discoverSkills(
  cwd: string,
  opts?: { userHome?: string; limit?: number },
): SkillFile[] {
  const home = opts?.userHome ?? homedir();
  const found = [
    ...scanFlatDir(join(cwd, ".wanwu", "skills"), "workspace"),
    ...scanAgentSkills(join(cwd, ".agents", "skills")),
    ...scanFlatDir(join(home, ".wanwu", "skills"), "user"),
  ];
  return found.slice(0, opts?.limit ?? MAX_LIST);
}

/** Resolve UI/ACP ids to skill files (id, name, or basename). */
export function selectSkills(all: SkillFile[], ids: string[]): SkillFile[] {
  if (!ids.length) return [];
  const wanted = ids.map((id) => id.trim()).filter(Boolean);
  const picked: SkillFile[] = [];
  for (const raw of wanted) {
    const hit = all.find(
      (s) =>
        s.id === raw ||
        s.name === raw ||
        s.id.endsWith(`/${raw}`) ||
        basename(s.path) === raw ||
        basename(s.path) === `${raw}.md`,
    );
    if (hit) pushSkill(picked, hit);
  }
  return picked.slice(0, MAX_PROMPT_SKILLS);
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
  const body = readPreview(absPath);
  if (!body) return undefined;
  const stem = basename(absPath).replace(/\.(md|markdown)$/i, "") || "skill";
  return {
    id: `file/${stem}`,
    name: stem,
    path: absPath,
    source: "file",
    preview: body.preview,
    summary: body.summary || stem,
  };
}

export function stripSkillTags(text: string): string {
  return text
    .replace(/\[SKILL_IMPORT\s+name="[^"]*"\]\n[\s\S]*?\n\[\/SKILL_IMPORT\]\n?/g, "")
    .replace(/\[SKILLFILE=[^\]]*\]\n?/g, "")
    .replace(/\[SKILLS=[^\]]*\]\n?/g, "");
}

export function renderSkillsForPrompt(skills: SkillFile[]): string {
  if (!skills.length) return "";
  return skills
    .map((s) => `# Skill: ${s.name} (${s.id})\n${s.preview}`)
    .join("\n\n---\n\n");
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
