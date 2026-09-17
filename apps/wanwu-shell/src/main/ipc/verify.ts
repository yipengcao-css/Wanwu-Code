import { spawn, type ChildProcess } from "node:child_process";
import { ipcMain, type BrowserWindow } from "electron";
import { loadSettings } from "../settings.js";

let running: ChildProcess | undefined;

/**
 * P2 "verify mode": run the project's test/lint command in the workspace and
 * stream output to the renderer, then report the exit code. The command is
 * configurable in Settings (default `pnpm test`).
 */
export function registerVerifyIpc(getRoot: () => string | null, getWin: () => BrowserWindow | null): void {
  ipcMain.handle("verify:run", (_e, cmdOverride?: string): { ok: boolean; command: string } => {
    const root = getRoot();
    if (!root) return { ok: false, command: "" };
    if (running && running.exitCode === null) return { ok: false, command: "already running" };

    const command = (cmdOverride?.trim() || loadSettings().verifyCommand || "pnpm test").trim();
    const win = getWin();
    const emit = (channel: string, payload: unknown): void => win?.webContents.send(channel, payload);

    emit("verify:data", `$ ${command}\n`);
    const child = spawn(command, {
      cwd: root,
      shell: true,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
    });
    running = child;

    child.stdout?.on("data", (b: Buffer) => emit("verify:data", b.toString("utf8")));
    child.stderr?.on("data", (b: Buffer) => emit("verify:data", b.toString("utf8")));
    child.on("error", (err) => emit("verify:data", `\n[spawn error] ${err.message}\n`));
    child.on("close", (code) => {
      running = undefined;
      emit("verify:done", { exitCode: code ?? -1 });
    });

    return { ok: true, command };
  });

  ipcMain.handle("verify:cancel", () => {
    if (running && running.exitCode === null) {
      running.kill("SIGTERM");
      running = undefined;
      return true;
    }
    return false;
  });
}

export function disposeVerify(): void {
  if (running && running.exitCode === null) {
    running.kill("SIGTERM");
  }
  running = undefined;
}
