import { existsSync } from "node:fs";
import { platform } from "node:os";
import process from "node:process";
import { ipcMain, type BrowserWindow } from "electron";
import * as pty from "node-pty";
import type { IPty } from "node-pty";

let term: IPty | undefined;

/**
 * Pick a sensible interactive shell for the host OS.
 *
 * P0-2 fix: never hard-code `process.env.SHELL || "/bin/bash"`. On Windows
 * `SHELL` is normally empty and `/bin/bash` does not exist, so resolve a real
 * Windows shell (PowerShell 7 → Windows PowerShell → cmd). On POSIX honor
 * `$SHELL` and fall back to the first shell that actually exists.
 */
export function resolveShell(): { shell: string; args: string[] } {
  const override = process.env["WANWU_TERMINAL_SHELL"];
  if (override) return { shell: override, args: [] };

  if (platform() === "win32") {
    const programFiles = process.env["ProgramFiles"];
    const systemRoot = process.env["SystemRoot"] ?? "C:\\Windows";
    if (programFiles) {
      const pwsh = `${programFiles}\\PowerShell\\7\\pwsh.exe`;
      if (existsSync(pwsh)) return { shell: pwsh, args: ["-NoLogo"] };
    }
    const winPowerShell = `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    if (existsSync(winPowerShell)) return { shell: winPowerShell, args: ["-NoLogo"] };
    return { shell: process.env["ComSpec"] ?? `${systemRoot}\\System32\\cmd.exe`, args: [] };
  }

  const shell = process.env["SHELL"];
  if (shell && shell.trim().length > 0) return { shell, args: [] };
  for (const candidate of ["/bin/bash", "/bin/zsh", "/bin/sh"]) {
    if (existsSync(candidate)) return { shell: candidate, args: [] };
  }
  return { shell: "/bin/sh", args: [] };
}

export function registerTermIpc(
  getRoot: () => string | null,
  getWin: () => BrowserWindow | null,
): void {
  ipcMain.handle("term:start", (_e, opts?: { cols?: number; rows?: number }) => {
    if (term) return true;
    const cwd = getRoot() ?? process.cwd();
    const { shell, args } = resolveShell();
    const child = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: Math.max(opts?.cols ?? 80, 2),
      rows: Math.max(opts?.rows ?? 24, 1),
      cwd,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
    });
    term = child;
    child.onData((data) => getWin()?.webContents.send("term:data", data));
    child.onExit(({ exitCode }) => {
      getWin()?.webContents.send("term:data", `\r\n[shell exited ${exitCode}]\r\n`);
      term = undefined;
    });
    return true;
  });

  ipcMain.handle("term:write", (_e, data: string) => {
    if (!term) return false;
    term.write(data);
    return true;
  });

  ipcMain.handle("term:resize", (_e, cols: number, rows: number) => {
    if (!term) return false;
    try {
      term.resize(Math.max(cols, 2), Math.max(rows, 1));
    } catch {
      /* terminal may have exited */
    }
    return true;
  });

  ipcMain.handle("term:stop", () => {
    disposeTerm();
    return true;
  });
}

export function disposeTerm(): void {
  if (term) {
    try {
      term.kill();
    } catch {
      /* already gone */
    }
    term = undefined;
  }
}
