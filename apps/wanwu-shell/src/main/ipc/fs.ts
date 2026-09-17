import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInsideRoot } from "../pathSandbox.js";

export type DirEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
};

export type ReadResult = {
  content: string;
  binary: boolean;
  /** Detected source encoding: "utf-8" | "utf-16le" | "utf-16be" | "gb18030" | "binary". */
  encoding: string;
};

// Only skip node_modules for performance. Dotfiles, `.wanwu`, `.git`, `dist`,
// etc. are intentionally shown so config/state is discoverable (P1/P2 fix:
// previously `.wanwu`/`.git` and all dotfiles were hidden from the tree).
const SKIP = new Set(["node_modules"]);

async function listDir(root: string, rel = "."): Promise<DirEntry[]> {
  const abs = resolveInsideRoot(root, rel);
  const names = await fs.readdir(abs, { withFileTypes: true });
  const out: DirEntry[] = [];
  for (const entry of names) {
    if (SKIP.has(entry.name)) continue;
    const childAbs = path.join(abs, entry.name);
    const childRel = path.relative(root, childAbs).split(path.sep).join("/");
    out.push({
      name: entry.name,
      path: childRel,
      type: entry.isDirectory() ? "dir" : "file",
    });
  }
  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

/** NUL byte in the first 8KB ⇒ treat as binary (avoid corrupting on save). */
function isBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8192);
  for (let i = 0; i < len; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * Decode a text buffer, detecting the encoding (P1/P2: non-UTF-8 support).
 * Order: BOM (UTF-16/UTF-8) → strict UTF-8 → GB18030 (CJK legacy superset).
 */
function decodeText(buf: Buffer): ReadResult {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { content: new TextDecoder("utf-16le").decode(buf.subarray(2)), binary: false, encoding: "utf-16le" };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { content: new TextDecoder("utf-16be").decode(buf.subarray(2)), binary: false, encoding: "utf-16be" };
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { content: new TextDecoder("utf-8").decode(buf.subarray(3)), binary: false, encoding: "utf-8" };
  }
  if (isBinary(buf)) {
    return { content: "", binary: true, encoding: "binary" };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { content: text, binary: false, encoding: "utf-8" };
  } catch {
    // Not valid UTF-8 — best-effort decode as GB18030 (covers GBK/GB2312).
    return { content: new TextDecoder("gb18030").decode(buf), binary: false, encoding: "gb18030" };
  }
}

export function registerFsIpc(getRoot: () => string | null, setRoot: (r: string) => void): void {
  ipcMain.handle("workspace:getRoot", () => getRoot());

  ipcMain.handle("workspace:openDialog", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    setRoot(result.filePaths[0]);
    return result.filePaths[0];
  });

  ipcMain.handle("workspace:openPath", (_e, dirPath: string) => {
    const abs = path.resolve(dirPath);
    setRoot(abs);
    return abs;
  });

  ipcMain.handle("fs:list", async (_e, rel?: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    return listDir(root, rel ?? ".");
  });

  ipcMain.handle("fs:read", async (_e, rel: string): Promise<ReadResult> => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const abs = resolveInsideRoot(root, rel);
    return decodeText(await fs.readFile(abs));
  });

  ipcMain.handle("fs:write", async (_e, rel: string, content: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const abs = resolveInsideRoot(root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    return true;
  });

  ipcMain.handle("fs:create", async (_e, parentRel: string, name: string, type: "file" | "dir") => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const parent = parentRel && parentRel !== "." ? `${parentRel}/${name}` : name;
    const abs = resolveInsideRoot(root, parent);
    if (type === "dir") {
      await fs.mkdir(abs, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, "", { flag: "wx" });
    }
    return path.relative(root, abs).split(path.sep).join("/");
  });

  ipcMain.handle("fs:rename", async (_e, rel: string, newName: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const oldAbs = resolveInsideRoot(root, rel);
    const newAbs = path.join(path.dirname(oldAbs), newName);
    resolveInsideRoot(root, path.relative(root, newAbs).split(path.sep).join("/"));
    await fs.rename(oldAbs, newAbs);
    return path.relative(root, newAbs).split(path.sep).join("/");
  });

  ipcMain.handle("fs:delete", async (_e, rel: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const abs = resolveInsideRoot(root, rel);
    await fs.rm(abs, { recursive: true, force: true });
    return true;
  });

  ipcMain.handle("fs:allFiles", async (): Promise<string[]> => {
    const root = getRoot();
    if (!root) return [];
    return listAllFiles(root);
  });
}

const ALLFILES_SKIP = new Set(["node_modules", ".git", "dist", "out", "code-oss", ".turbo", "coverage"]);
const ALLFILES_MAX = 5000;

/** Flat list of workspace files (relative), for the command palette quick-open. */
async function listAllFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (out.length >= ALLFILES_MAX) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= ALLFILES_MAX) return;
      if (entry.isDirectory()) {
        if (ALLFILES_SKIP.has(entry.name)) continue;
        await walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/"));
      }
    }
  }
  await walk(root);
  return out;
}
