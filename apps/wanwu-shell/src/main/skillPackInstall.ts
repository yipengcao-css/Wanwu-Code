import { app } from "electron";
import { cpSync, existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PACK_ID, userSkillPackRoot } from "@wanwu/skills";

function bundledAzureOpsPack(): string | null {
  if (app.isPackaged) {
    const p = join(process.resourcesPath, "skill-packs", DEFAULT_PACK_ID);
    return existsSync(p) ? p : null;
  }
  const dev = join(app.getAppPath(), "resources", "skill-packs", DEFAULT_PACK_ID);
  if (existsSync(dev)) return dev;
  const monorepo = join(app.getAppPath(), "..", "..", "resources", "skill-packs", DEFAULT_PACK_ID);
  return existsSync(monorepo) ? monorepo : null;
}

function packLooksInstalled(dest: string): boolean {
  const marker = join(dest, "AKS", "SKILL.md");
  return existsSync(marker);
}

/** Copy bundled Azure ops pack into `~/.wanwu/skill-packs/azure-ops` on first launch. */
export function ensureUserSkillPackInstalled(): string | null {
  const dest = userSkillPackRoot(homedir(), DEFAULT_PACK_ID);
  if (packLooksInstalled(dest)) return dest;
  const src = bundledAzureOpsPack();
  if (!src) return null;
  try {
    mkdirSync(join(homedir(), ".wanwu", "skill-packs"), { recursive: true });
    cpSync(src, dest, {
      recursive: true,
      filter: (p) => {
        const base = p.split(/[/\\]/).pop() ?? "";
        if (base === "__pycache__" || base === ".wanwu" || base === ".agents") return false;
        return true;
      },
    });
    if (!packLooksInstalled(dest)) return null;
    return dest;
  } catch {
    return null;
  }
}

export function bundledPackStats(): { src: string | null; dest: string; ready: boolean } {
  const dest = userSkillPackRoot(homedir(), DEFAULT_PACK_ID);
  const src = bundledAzureOpsPack();
  let ready = packLooksInstalled(dest);
  if (!ready && src) {
    try {
      ready = statSync(src).isDirectory();
    } catch {
      ready = false;
    }
  }
  return { src, dest, ready };
}