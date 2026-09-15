import { ipcMain, type BrowserWindow } from "electron";
import type { IPty } from "node-pty";
import { resolveShell } from "../shellResolve.js";

const ptys = new Map<string, IPty>();

async function loadPty(): Promise<typeof import("node-pty")> {
  return import("node-pty");
}

export function registerTermIpc(getRoot: () => string | null, getWin: () => BrowserWindow | null): void {
  ipcMain.handle("term:start", async (_e, id: string, cols?: number, rows?: number) => {
    const termId = id || "t1";
    if (ptys.has(termId)) return true;
    const cwd = getRoot() ?? process.cwd();
    const shell = resolveShell();
    const pty = await loadPty();
    const proc = pty.spawn(shell.file, shell.args, {
      name: "xterm-256color",
      cols: Math.max(2, cols ?? 80),
      rows: Math.max(1, rows ?? 24),
      cwd,
      env: process.env as Record<string, string>,
    });
    ptys.set(termId, proc);
    const win = getWin();
    proc.onData((data) => {
      win?.webContents.send("term:data", { id: termId, data });
    });
    proc.onExit(({ exitCode }) => {
      win?.webContents.send("term:data", {
        id: termId,
        data: `\r\n[shell exited ${exitCode} · ${shell.label}]\r\n`,
      });
      ptys.delete(termId);
    });
    return true;
  });

  ipcMain.handle("term:write", (_e, id: string, data: string) => {
    const proc = ptys.get(id || "t1");
    if (!proc) return false;
    proc.write(data);
    return true;
  });

  ipcMain.handle("term:resize", (_e, id: string, cols: number, rows: number) => {
    const proc = ptys.get(id || "t1");
    if (!proc) return false;
    proc.resize(Math.max(2, cols), Math.max(1, rows));
    return true;
  });

  ipcMain.handle("term:stop", (_e, id: string) => {
    const termId = id || "t1";
    const proc = ptys.get(termId);
    if (proc) {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      ptys.delete(termId);
    }
    return true;
  });
}

export function disposeTerm(): void {
  for (const proc of ptys.values()) {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
  }
  ptys.clear();
}
