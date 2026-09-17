import { ipcMain } from "electron";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type SymbolHit = { name: string; kind: string; path: string; line: number; preview: string };
export type ContextItem = { name: string; path?: string };
export type ContextInfo = {
  memory: ContextItem[];
  skills: ContextItem[];
  hooks: ContextItem[];
  rules: ContextItem[];
  mcp: ContextItem[];
};

const SKIP = new Set(["node_modules", ".git", "dist", "out", "code-oss", ".turbo", "coverage"]);
const MAX_SYMBOLS = 400;
const MAX_FILE_BYTES = 512 * 1024;

const DEF_RE =
  /\b(?:export\s+(?:default\s+)?)?(?:async\s+)?(function|class|interface|type|const|let|var|enum|def|func|fn)\s+([A-Za-z_$][\w$]*)/;

/** Lightweight workspace symbol index (definition lines) — a pragmatic stand-in for LSP. */
async function findSymbols(root: string, query: string): Promise<SymbolHit[]> {
  const q = query.trim().toLowerCase();
  const hits: SymbolHit[] = [];
  async function walk(dir: string): Promise<void> {
    if (hits.length >= MAX_SYMBOLS) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (hits.length >= MAX_SYMBOLS) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|c|cc|cpp|h|hpp|rb|php)$/.test(entry.name)) {
        try {
          const stat = await fs.stat(full);
          if (stat.size > MAX_FILE_BYTES) continue;
          const buf = await fs.readFile(full);
          if (buf.includes(0)) continue;
          const lines = buf.toString("utf8").split("\n");
          for (let i = 0; i < lines.length; i += 1) {
            const mtch = DEF_RE.exec(lines[i]!);
            if (!mtch) continue;
            const name = mtch[2]!;
            if (q && !name.toLowerCase().includes(q)) continue;
            hits.push({
              name,
              kind: mtch[1]!,
              path: path.relative(root, full).split(path.sep).join("/"),
              line: i + 1,
              preview: lines[i]!.trim().slice(0, 160),
            });
            if (hits.length >= MAX_SYMBOLS) return;
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(root);
  return hits;
}

async function listDirItems(dir: string): Promise<ContextItem[]> {
  try {
    const names = await fs.readdir(dir);
    return names.sort().map((n) => ({ name: n, path: path.join(dir, n) }));
  } catch {
    return [];
  }
}

function discoverMcp(root: string): ContextItem[] {
  const names = new Set<string>();
  const re = /\[mcp\.servers\.([A-Za-z0-9_-]+)\]/g;
  for (const f of [path.join(root, ".wanwu", "settings.toml"), path.join(homedir(), ".wanwu", "config.toml")]) {
    try {
      if (!existsSync(f)) continue;
      const text = readFileSync(f, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) names.add(m[1]!);
    } catch {
      /* ignore */
    }
  }
  return [...names].map((name) => ({ name }));
}

async function discoverContext(root: string): Promise<ContextInfo> {
  const memory: ContextItem[] = [];
  for (const f of ["WANWU.md", "AGENTS.md", "CLAUDE.md"]) {
    const p = path.join(root, f);
    if (existsSync(p)) memory.push({ name: f, path: f });
  }
  const skills = (await listDirItems(path.join(root, ".wanwu", "skills"))).map((s) => ({
    name: s.name,
    path: path.join(".wanwu", "skills", s.name),
  }));
  const hooks = (await listDirItems(path.join(root, ".wanwu", "hooks"))).map((s) => ({
    name: s.name,
    path: path.join(".wanwu", "hooks", s.name),
  }));
  const rules: ContextItem[] = [];
  for (const f of [".wanwu/settings.toml", ".cursor/rules"]) {
    if (existsSync(path.join(root, f))) rules.push({ name: f, path: f });
  }
  return { memory, skills, hooks, rules, mcp: discoverMcp(root) };
}

export function registerContextIpc(getRoot: () => string | null): void {
  ipcMain.handle("symbols:find", async (_e, query: string): Promise<SymbolHit[]> => {
    const root = getRoot();
    if (!root) return [];
    return findSymbols(root, query ?? "");
  });
  ipcMain.handle("context:discover", async (): Promise<ContextInfo> => {
    const root = getRoot();
    if (!root) return { memory: [], skills: [], hooks: [], rules: [], mcp: [] };
    return discoverContext(root);
  });
}
