import { dialog, ipcMain, type BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
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
}
