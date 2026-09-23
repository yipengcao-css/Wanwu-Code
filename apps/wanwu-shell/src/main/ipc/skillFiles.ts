import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join } from "node:path";

const MAX_BYTES = 64 * 1024;

export type SavedSkill = {
  id: string;
  name: string;
  path: string;
};

export type PickedSkill = SavedSkill & { summary: string };

export const SKILL_DRAFT_SYSTEM = [
  "你在为本地编码助手写一份 Skill（纯文本说明，不是可执行脚本）。",
  "只输出 Markdown，不要用代码围栏包住整篇。",
  "开头使用 YAML frontmatter：name（短横线英文或原文短名）、description（一句话）。",
  "正文用中文写清：何时使用、必须遵守的规则、不要做的事。规则要具体，方便助手在每轮任务开始时照做。",
  "不要写密钥，不要要求读取技能目录以外的私密文件。",
].join("\n");

export function slugSkillName(raw: string): string {
  const slug = raw
    .trim()
    .replace(/\.(md|markdown)$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "skill";
}

export function fileSkillId(absPath: string): string {
  const stem = basename(absPath).replace(/\.(md|markdown)$/i, "");
  const hash = createHash("sha256").update(absPath).digest("hex").slice(0, 6);
  return `file/${slugSkillName(stem)}-${hash}`;
}

function summaryOf(body: string, fallback: string): string {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("---")) continue;
    if (/^(name|description|license|metadata|author|version):/i.test(line)) continue;
    return line.replace(/^#+\s*/, "").replace(/^["']|["']$/g, "").slice(0, 80);
  }
  return fallback;
}

export function unwrapSkillMarkdown(raw: string): string {
  const text = raw.trim();
  const fence = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return (fence?.[1] ?? text).trim();
}

export function skillNameFromMarkdown(markdown: string, fallback: string): string {
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const named = fm?.[1]?.match(/^name:\s*["']?([^"'\n]+)["']?/m)?.[1];
  return slugSkillName(named || fallback || "skill");
}

export function readMarkdownFile(absPath: string): PickedSkill {
  if (!isAbsolute(absPath)) throw new Error("请选择本机上的 Markdown 文件");
  const ext = extname(absPath).toLowerCase();
  if (ext !== ".md" && ext !== ".markdown") throw new Error("只能选择 Markdown 文件");
  const st = statSync(absPath);
  if (!st.isFile()) throw new Error("不是文件");
  if (st.size > MAX_BYTES) throw new Error("Markdown 超过 64KB");
  const text = readFileSync(absPath, "utf8");
  if (!text.trim()) throw new Error("文件是空的");
  const stem = basename(absPath).replace(/\.(md|markdown)$/i, "");
  const name = stem || "skill";
  return {
    id: fileSkillId(absPath),
    name,
    path: absPath,
    summary: summaryOf(text, name),
  };
}

export function saveSkillFile(opts: {
  dest: "workspace" | "user";
  root: string | null;
  name: string;
  body: string;
  userHome?: string;
}): SavedSkill {
  const body = unwrapSkillMarkdown(opts.body);
  if (!body) throw new Error("Skill 内容是空的");
  if (Buffer.byteLength(body, "utf8") > MAX_BYTES) throw new Error("Skill 超过 64KB");
  const home = opts.userHome ?? homedir();
  const dir =
    opts.dest === "workspace"
      ? opts.root
        ? join(opts.root, ".wanwu", "skills")
        : null
      : join(home, ".wanwu", "skills");
  if (!dir) throw new Error("请先打开工作区，或改存到本机 Skill 目录");
  mkdirSync(dir, { recursive: true });
  const base = skillNameFromMarkdown(body, opts.name);
  let stem = base;
  let n = 2;
  while (existsSync(join(dir, `${stem}.md`))) {
    stem = `${base}-${n}`;
    n += 1;
    if (n > 50) throw new Error("同名 Skill 太多");
  }
  const abs = join(dir, `${stem}.md`);
  writeFileSync(abs, body.endsWith("\n") ? body : `${body}\n`, "utf8");
  const source = opts.dest === "workspace" ? "workspace" : "user";
  return { id: `${source}/${stem}`, name: stem, path: abs };
}
