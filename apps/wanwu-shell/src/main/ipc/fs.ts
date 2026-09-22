import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { createDesktopProject } from "../desktopWorkspace.js";
import { resolveInsideRoot } from "../pathSandbox.js";

export type DirEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
};

const SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  "code-oss",
  ".wanwu",
  "coverage",
]);

async function listDir(root: string, rel = "."): Promise<DirEntry[]> {
  const abs = resolveInsideRoot(root, rel);
  const names = await fs.readdir(abs);
  const out: DirEntry[] = [];
  for (const name of names.sort()) {
    if (name.startsWith(".") && name !== ".gitignore") continue;
    if (SKIP.has(name)) continue;
    const childAbs = path.join(abs, name);
    const st = await fs.stat(childAbs);
    const childRel = path.relative(root, childAbs).split(path.sep).join("/");
    out.push({
      name,
      path: childRel,
      type: st.isDirectory() ? "dir" : "file",
    });
  }
  return out;
}

const SEARCH_MAX_RESULTS = 200;
const SEARCH_MAX_FILE_BYTES = 512 * 1024;

async function walkForSearch(root: string, dir: string, out: string[], cap: number): Promise<void> {
  if (out.length >= cap) return;
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (SKIP.has(name)) continue;
    const abs = path.join(dir, name);
    let st;
    try {
      st = await fs.stat(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      await walkForSearch(root, abs, out, cap);
    } else if (st.isFile() && st.size <= SEARCH_MAX_FILE_BYTES) {
      out.push(path.relative(root, abs).split(path.sep).join("/"));
      if (out.length >= cap) return;
    }
  }
}

export type SearchHit = { path: string; line: number; text: string };

async function searchInWorkspace(root: string, query: string): Promise<SearchHit[]> {
  const files: string[] = [];
  await walkForSearch(root, root, files, 2000);
  let re: RegExp;
  try {
    re = new RegExp(query, "i");
  } catch {
    re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
  const hits: SearchHit[] = [];
  for (const rel of files) {
    if (hits.length >= SEARCH_MAX_RESULTS) break;
    let text: string;
    try {
      text = await fs.readFile(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue; // binary
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i]!)) {
        hits.push({ path: rel, line: i + 1, text: lines[i]!.trim().slice(0, 200) });
        if (hits.length >= SEARCH_MAX_RESULTS) break;
      }
    }
  }
  return hits;
}

let watcher: FSWatcher | undefined;
let watchTimer: ReturnType<typeof setTimeout> | undefined;

export function stopWatching(): void {
  watcher?.close();
  watcher = undefined;
  if (watchTimer) clearTimeout(watchTimer);
}

function startWatching(root: string, getWin: () => BrowserWindow | null): void {
  stopWatching();
  try {
    watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const rel = filename.split(path.sep).join("/");
      const first = rel.split("/")[0] ?? "";
      if (SKIP.has(first) || first.startsWith(".git")) return;
      // Debounce bursts (saves, formatter runs).
      if (watchTimer) clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        getWin()?.webContents.send("fs:changed", rel);
      }, 250);
    });
  } catch {
    // recursive watch unsupported (old Linux Node) — degrade silently
  }
}

export function registerFsIpc(
  getRoot: () => string | null,
  setRoot: (r: string) => void,
  getWin?: () => BrowserWindow | null,
): void {
  const setRootAndWatch = (r: string): void => {
    setRoot(r);
    if (getWin) startWatching(r, getWin);
  };

  ipcMain.handle("workspace:getRoot", () => getRoot());

  ipcMain.handle("workspace:openDialog", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    setRootAndWatch(result.filePaths[0]);
    return result.filePaths[0];
  });

  ipcMain.handle("workspace:openPath", (_e, dirPath: string) => {
    const abs = path.resolve(dirPath);
    setRootAndWatch(abs);
    return abs;
  });

  ipcMain.handle("workspace:ensureDesktop", (_e, prompt?: string) => {
    const current = getRoot();
    if (current) return { root: current, created: false };
    const desktop = app.getPath("desktop");
    const dir = createDesktopProject(desktop, typeof prompt === "string" ? prompt : "task");
    setRootAndWatch(dir);
    getWin?.()?.webContents.send("workspace:changed", dir);
    return { root: dir, created: true };
  });

  ipcMain.handle("fs:list", async (_e, rel?: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    return listDir(root, rel ?? ".");
  });

  ipcMain.handle("fs:read", async (_e, rel: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const abs = resolveInsideRoot(root, rel);
    return fs.readFile(abs, "utf8");
  });

  ipcMain.handle("fs:write", async (_e, rel: string, content: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const abs = resolveInsideRoot(root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    return true;
  });

  ipcMain.handle("fs:search", async (_e, query: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    if (!query.trim()) return [];
    return searchInWorkspace(root, query.trim());
  });

  ipcMain.handle("fs:listFiles", async () => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const files: string[] = [];
    await walkForSearch(root, root, files, 500);
    return files;
  });

  // Watch workspace for external changes (formatter, git checkout, agent edits).
  const root = getRoot();
  if (root && getWin) startWatching(root, getWin);
}
