import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { firstSummaryLine, parseSkillFrontmatter } from "./parse.js";
import { resolveSkillsRoot, userSkillPacksDir } from "./roots.js";

export type SkillSource = "workspace" | "agents" | "user" | "pack" | "file";

export interface SkillFile {
  id: string;
  name: string;
  path: string;
  source: SkillSource;
  /** Catalog line (description or first heading). */
  summary: string;
  /** YAML frontmatter description when set. */
  description: string;
  /** Legacy preview field — catalog text only unless loadFullSkillBody was used. */
  preview: string;
}

const MAX_LIST = 64;
const MAX_BODY = 512 * 1024;
const SKIP_DIR = new Set([
  "__pycache__",
  ".git",
  ".wanwu",
  ".agents",
  "node_modules",
  "frontend-design-3",
]);

function pushSkill(out: SkillFile[], skill: SkillFile): void {
  if (out.some((s) => s.id === skill.id || (skill.path && s.path === skill.path))) return;
  out.push(skill);
}

function catalogFromBody(body: string, fallbackName: string): { summary: string; description: string } {
  const fm = parseSkillFrontmatter(body);
  const description = fm.description?.trim() || firstSummaryLine(body) || fallbackName;
  const summary = description.slice(0, 160);
  return { summary, description };
}

function readCatalog(path: string): { body: string; summary: string; description: string } | undefined {
  try {
    const body = readFileSync(path, "utf8");
    if (!body.trim()) return undefined;
    const { summary, description } = catalogFromBody(body, basename(path));
    return { body, summary, description };
  } catch {
    return undefined;
  }
}

export function loadFullSkillBody(path: string): string {
  try {
    return readFileSync(path, "utf8").slice(0, MAX_BODY);
  } catch {
    return "";
  }
}

function scanFlatDir(dir: string, source: SkillSource, idPrefix: string): SkillFile[] {
  if (!existsSync(dir)) return [];
  const out: SkillFile[] = [];
  for (const name of readdirSync(dir)) {
    if (!(name.endsWith(".md") || name.endsWith(".toml"))) continue;
    const path = join(dir, name);
    const cat = readCatalog(path);
    if (!cat) continue;
    const stem = name.replace(/\.(md|toml)$/i, "");
    out.push({
      id: `${idPrefix}/${stem}`,
      name: stem,
      path,
      source,
      summary: cat.summary,
      description: cat.description,
      preview: cat.description.slice(0, 400),
    });
  }
  return out;
}

function scanAgentSkills(dir: string): SkillFile[] {
  if (!existsSync(dir)) return [];
  const out: SkillFile[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const folder = join(dir, name);
    try {
      if (!statSync(folder).isDirectory()) continue;
    } catch {
      continue;
    }
    const path = join(folder, "SKILL.md");
    const cat = readCatalog(path);
    if (!cat) continue;
    const fm = parseSkillFrontmatter(cat.body);
    out.push({
      id: `agents/${name}`,
      name: fm.name?.trim() || name,
      path,
      source: "agents",
      summary: cat.summary,
      description: cat.description,
      preview: cat.description.slice(0, 400),
    });
  }
  return out;
}

/** Directory skills under a pack root (`<pack>/<name>/SKILL.md` and `_shared/<name>/SKILL.md`). */
function scanPackRoot(packRoot: string, packId: string): SkillFile[] {
  if (!existsSync(packRoot)) return [];
  const out: SkillFile[] = [];
  const addSkill = (folderName: string, skillPath: string) => {
    const cat = readCatalog(skillPath);
    if (!cat) return;
    const fm = parseSkillFrontmatter(cat.body);
    const name = fm.name?.trim() || folderName;
    pushSkill(out, {
      id: `pack/${packId}/${folderName}`,
      name,
      path: skillPath,
      source: "pack",
      summary: cat.summary,
      description: cat.description,
      preview: cat.description.slice(0, 400),
    });
  };

  for (const name of readdirSync(packRoot)) {
    if (SKIP_DIR.has(name) || name.startsWith(".")) continue;
    const entry = join(packRoot, name);
    let st;
    try {
      st = statSync(entry);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const skillMd = join(entry, "SKILL.md");
      if (existsSync(skillMd)) addSkill(name, skillMd);
      continue;
    }
    if (name === "SKILL.md") addSkill(packId, entry);
  }

  const shared = join(packRoot, "_shared");
  if (existsSync(shared) && statSync(shared).isDirectory()) {
    for (const name of readdirSync(shared)) {
      if (SKIP_DIR.has(name) || name.startsWith(".")) continue;
      const sub = join(shared, name);
      try {
        if (!statSync(sub).isDirectory()) continue;
      } catch {
        continue;
      }
      const skillMd = join(sub, "SKILL.md");
      if (existsSync(skillMd)) addSkill(`_shared/${name}`, skillMd);
    }
  }
  return out;
}

function scanAllUserPacks(home: string): SkillFile[] {
  const base = userSkillPacksDir(home);
  if (!existsSync(base)) return [];
  const out: SkillFile[] = [];
  for (const packId of readdirSync(base)) {
    if (SKIP_DIR.has(packId) || packId.startsWith(".")) continue;
    const packRoot = join(base, packId);
    try {
      if (!statSync(packRoot).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const s of scanPackRoot(packRoot, packId)) pushSkill(out, s);
  }
  return out;
}

export function discoverSkills(
  cwd: string,
  opts?: { userHome?: string; limit?: number; env?: NodeJS.ProcessEnv },
): SkillFile[] {
  const home = opts?.userHome ?? process.env.HOME ?? process.env.USERPROFILE ?? "/";
  const env = opts?.env ?? process.env;
  const found = [
    ...scanFlatDir(join(cwd, ".wanwu", "skills"), "workspace", "workspace"),
    ...scanAgentSkills(join(cwd, ".agents", "skills")),
    ...scanFlatDir(join(home, ".wanwu", "skills"), "user", "user"),
    ...scanAllUserPacks(home),
  ];
  // Also honor WANWU_SKILLS_ROOT if it points outside ~/.wanwu/skill-packs
  const root = resolveSkillsRoot(env, home);
  if (existsSync(root) && !found.some((s) => s.path.startsWith(root))) {
    const packId = basename(root);
    for (const s of scanPackRoot(root, packId)) pushSkill(found, s);
  }
  return found.slice(0, opts?.limit ?? MAX_LIST);
}

export function renderSkillCatalog(skills: SkillFile[]): string {
  const pack = skills.filter((s) => s.source === "pack");
  if (!pack.length) return "";
  return pack
    .map((s) => `- ${s.name} (\`${s.id}\`): ${s.description.slice(0, 200)}`)
    .join("\n");
}

export function renderSkillsForPrompt(skills: SkillFile[], opts?: { full?: boolean }): string {
  if (!skills.length) return "";
  const full = opts?.full !== false;
  return skills
    .map((s) => {
      const loaded = full && s.path ? loadFullSkillBody(s.path) : "";
      const body = loaded.trim() || s.preview || s.description || s.summary;
      return `# Skill: ${s.name} (${s.id})\n${body}`;
    })
    .join("\n\n---\n\n");
}

export function selectSkills(all: SkillFile[], ids: string[]): SkillFile[] {
  const MAX = 8;
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
  return picked.slice(0, MAX);
}