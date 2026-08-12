import { ipcMain, type BrowserWindow } from "electron";
import { LspSessionManager } from "../lsp/sessionManager.js";
import { hasLspMapping } from "../lsp/uri.js";

let manager: LspSessionManager | undefined;
let managerRoot: string | undefined;

function broadcast(win: BrowserWindow | null, channel: string, payload: unknown): void {
  win?.webContents.send(channel, payload);
}

function ensureManager(
  root: string,
  getWin: () => BrowserWindow | null,
): LspSessionManager {
  if (manager && managerRoot === root) return manager;
  disposeLsp();
  manager = new LspSessionManager({
    workspaceRoot: root,
    onDiagnostics: (payload) => broadcast(getWin(), "lsp:diagnostics", payload),
    onError: (message) => broadcast(getWin(), "lsp:error", message),
  });
  managerRoot = root;
  return manager;
}

export function disposeLsp(): void {
  manager?.dispose();
  manager = undefined;
  managerRoot = undefined;
}

export function onWorkspaceRootChangedForLsp(prev: string | null, next: string): void {
  if (prev && prev !== next) disposeLsp();
}

export function registerLspIpc(
  getRoot: () => string | null,
  getWin: () => BrowserWindow | null,
): void {
  ipcMain.handle("lsp:ensure", async () => {
    const root = getRoot();
    if (!root) return { ok: false, reason: "no-workspace" };
    const m = ensureManager(root, getWin);
    return { ok: true, servers: m.listServers().map((s) => s.id) };
  });

  ipcMain.handle("lsp:didOpen", async (_e, relPath: string, text: string) => {
    const root = getRoot();
    if (!root || !hasLspMapping(relPath)) return false;
    const m = ensureManager(root, getWin);
    return m.didOpen(relPath, text);
  });

  ipcMain.handle("lsp:didChange", async (_e, relPath: string, text: string) => {
    const root = getRoot();
    if (!root || !manager || !hasLspMapping(relPath)) return false;
    return manager.didChange(relPath, text);
  });

  ipcMain.handle("lsp:didClose", async (_e, relPath: string) => {
    if (!manager || !hasLspMapping(relPath)) return false;
    return manager.didClose(relPath);
  });

  ipcMain.handle("lsp:dispose", async () => {
    disposeLsp();
    return true;
  });
}
