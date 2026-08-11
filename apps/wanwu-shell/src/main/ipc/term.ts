import { ipcMain, type BrowserWindow } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

let shell: ChildProcessWithoutNullStreams | undefined;

export function registerTermIpc(getRoot: () => string | null, getWin: () => BrowserWindow | null): void {
  ipcMain.handle("term:start", () => {
    if (shell && !shell.killed) return true;
    const cwd = getRoot() ?? process.cwd();
    const shellPath = process.env.SHELL || "/bin/bash";
    shell = spawn(shellPath, ["-i"], {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const win = getWin();
    const push = (data: Buffer) => {
      win?.webContents.send("term:data", data.toString("utf8"));
    };
    shell.stdout.on("data", push);
    shell.stderr.on("data", push);
    shell.on("exit", (code) => {
      win?.webContents.send("term:data", `\r\n[shell exited ${code}]\r\n`);
      shell = undefined;
    });
    return true;
  });

  ipcMain.handle("term:write", (_e, data: string) => {
    if (!shell || shell.killed) return false;
    shell.stdin.write(data);
    return true;
  });

  ipcMain.handle("term:stop", () => {
    if (shell && !shell.killed) shell.kill();
    shell = undefined;
    return true;
  });
}

export function disposeTerm(): void {
  if (shell && !shell.killed) shell.kill();
  shell = undefined;
}
