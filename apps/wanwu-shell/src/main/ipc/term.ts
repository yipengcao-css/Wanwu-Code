import { ipcMain, type BrowserWindow } from "electron";
import type { IPty } from "node-pty";
import { resolveShell } from "../shellResolve.js";

let ptyProc: IPty | undefined;

async function loadPty(): Promise<typeof import("node-pty")> {
  return import("node-pty");
}

export function registerTermIpc(getRoot: () => string | null, getWin: () => BrowserWindow | null): void {
  ipcMain.handle("term:start", async (_e, cols?: number, rows?: number) => {
    if (ptyProc) return true;
    const cwd = getRoot() ?? process.cwd();
    const shell = resolveShell();
    const pty = await loadPty();
    ptyProc = pty.spawn(shell.file, shell.args, {
      name: "xterm-256color",
      cols: Math.max(2, cols ?? 80),
      rows: Math.max(1, rows ?? 24),
      cwd,
      env: process.env as Record<string, string>,
    });
    const win = getWin();
    ptyProc.onData((data) => {
      win?.webContents.send("term:data", data);
    });
    ptyProc.onExit(({ exitCode }) => {
      win?.webContents.send("term:data", `\r\n[shell exited ${exitCode} · ${shell.label}]\r\n`);
      ptyProc = undefined;
    });
    return true;
  });

  ipcMain.handle("term:write", (_e, data: string) => {
    if (!ptyProc) return false;
    ptyProc.write(data);
    return true;
  });

  ipcMain.handle("term:resize", (_e, cols: number, rows: number) => {
    if (!ptyProc) return false;
    ptyProc.resize(Math.max(2, cols), Math.max(1, rows));
    return true;
  });

  ipcMain.handle("term:stop", () => {
    if (ptyProc) {
      try {
        ptyProc.kill();
      } catch {
        /* ignore */
      }
      ptyProc = undefined;
    }
    return true;
  });
}

export function disposeTerm(): void {
  if (ptyProc) {
    try {
      ptyProc.kill();
    } catch {
      /* ignore */
    }
    ptyProc = undefined;
  }
}
