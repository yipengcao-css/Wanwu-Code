import { ipcMain, type BrowserWindow } from "electron";
import { resolveTsLspLaunch } from "../lsp/resolveTsLsp.js";
import { TsLspClient } from "../lsp/tsLspClient.js";
import { isTsLike } from "../lsp/uri.js";

let client: TsLspClient | undefined;
let clientRoot: string | undefined;
let starting: Promise<TsLspClient | undefined> | undefined;

function broadcast(win: BrowserWindow | null, channel: string, payload: unknown): void {
  win?.webContents.send(channel, payload);
}

async function ensureClient(
  root: string,
  getWin: () => BrowserWindow | null,
): Promise<TsLspClient | undefined> {
  if (client && clientRoot === root) return client;
  if (client && clientRoot !== root) {
    disposeLsp();
  }
  if (starting) return starting;

  starting = (async () => {
    const launch = resolveTsLspLaunch();
    if (!launch) {
      broadcast(getWin(), "lsp:error", "未找到 typescript-language-server");
      return undefined;
    }
    const c = new TsLspClient({
      workspaceRoot: root,
      launch,
      onDiagnostics: (payload) => broadcast(getWin(), "lsp:diagnostics", payload),
      onError: (message) => broadcast(getWin(), "lsp:error", message),
    });
    try {
      await c.start();
      client = c;
      clientRoot = root;
      return c;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      broadcast(getWin(), "lsp:error", `LSP 启动失败：${msg}`);
      c.dispose();
      return undefined;
    } finally {
      starting = undefined;
    }
  })();

  return starting;
}

export function disposeLsp(): void {
  client?.dispose();
  client = undefined;
  clientRoot = undefined;
  starting = undefined;
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
    const c = await ensureClient(root, getWin);
    return { ok: Boolean(c) };
  });

  ipcMain.handle("lsp:didOpen", async (_e, relPath: string, text: string) => {
    const root = getRoot();
    if (!root || !isTsLike(relPath)) return false;
    const c = await ensureClient(root, getWin);
    if (!c) return false;
    await c.didOpen(relPath, text);
    return true;
  });

  ipcMain.handle("lsp:didChange", async (_e, relPath: string, text: string) => {
    const root = getRoot();
    if (!root || !client || !isTsLike(relPath)) return false;
    await client.didChange(relPath, text);
    return true;
  });

  ipcMain.handle("lsp:didClose", async (_e, relPath: string) => {
    if (!client || !isTsLike(relPath)) return false;
    await client.didClose(relPath);
    return true;
  });

  ipcMain.handle("lsp:dispose", async () => {
    disposeLsp();
    return true;
  });
}
