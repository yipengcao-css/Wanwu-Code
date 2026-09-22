import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ILLEGAL = /[\\/:*?"<>|]/g;

/** Folder-safe name from the user's first task. */
export function slugTaskName(prompt: string): string {
  const cleaned = prompt
    .replace(/\[MODE=\w+\]\s*/g, "")
    .replace(/\[SKILLS=[^\]]*\]\s*/g, "")
    .replace(/\[EDITOR_CONTEXT\][\s\S]*?\[\/EDITOR_CONTEXT\]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const slug = (cleaned || "task")
    .replace(ILLEGAL, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || "task";
}

export function uniqueProjectDir(
  desktop: string,
  slug: string,
  exists: (p: string) => boolean = existsSync,
): string {
  const base = join(desktop, `Wanwu-${slug}`);
  if (!exists(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const next = `${base}-${i}`;
    if (!exists(next)) return next;
  }
  return `${base}-${Date.now()}`;
}

/** Create a new project folder on the desktop for an untitled session. */
export function createDesktopProject(desktop: string, prompt: string): string {
  mkdirSync(desktop, { recursive: true });
  const dir = uniqueProjectDir(desktop, slugTaskName(prompt));
  mkdirSync(dir, { recursive: true });
  const note = [
    `# ${slugTaskName(prompt)}`,
    "",
    "未打开工作区时，Wanwu 在桌面自动创建此文件夹，后续生成的文件都写在这里。",
    "",
  ].join("\n");
  writeFileSync(join(dir, "README.md"), note, "utf8");
  return dir;
}
