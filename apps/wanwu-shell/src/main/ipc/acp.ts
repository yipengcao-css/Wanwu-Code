import { app, ipcMain, type BrowserWindow } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AcpClient,
  type AcpEditProposal,
  type AcpPermissionRequest,
} from "@wanwu/acp-client";
import { resolveShellAcpLaunch } from "../acpLaunch.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** apps/wanwu-shell/dist/electron → repo root (dev / unpacked). */
function findRepoRoot(): string {
  return path.resolve(here, "../../../../");
}

let client: AcpClient | undefined;
let child: ChildProcessWithoutNullStreams | undefined;
let sessionId: string | undefined;

function broadcast(win: BrowserWindow | null, channel: string, payload: unknown): void {
  win?.webContents.send(channel, payload);
}

function startNativeAcp(cwd: string): AcpClient {
  const plan = resolveShellAcpLaunch({
    workspaceRoot: cwd,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    execPath: process.execPath,
    repoRoot: app.isPackaged ? undefined : findRepoRoot(),
  });
  child = spawn(plan.command, plan.args, {
    cwd: plan.spawnCwd,
    env: {
      ...process.env,
      ...plan.env,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return new AcpClient(child, {
    clientName: "wanwu-shell",
    clientVersion: "1.0.0-beta",
    protocolVersion: "0.1.0-wanwu",
  });
}

export function registerAcpIpc(getRoot: () => string | null, getWin: () => BrowserWindow | null): void {
  ipcMain.handle("acp:ensure", async () => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    if (!client) {
      client = startNativeAcp(root);
      const win = getWin();
      client.on("message", (text: string) => broadcast(win, "acp:message", text));
      client.on("tool", (tool) => broadcast(win, "acp:tool", tool));
      client.on("error", (err: Error) => broadcast(win, "acp:error", err.message));
      client.on("permission", (req: AcpPermissionRequest) =>
        broadcast(win, "acp:permission", req),
      );
      client.on("edit", (edit: AcpEditProposal) => broadcast(win, "acp:edit", edit));
      await client.initialize();
      sessionId = await client.newSession(root);
    }
    return { sessionId };
  });

  ipcMain.handle("acp:prompt", async (_e, text: string) => {
    if (!client || !sessionId) throw new Error("ACP not ready");
    return client.prompt(sessionId, text);
  });

  ipcMain.handle("acp:respondPermission", (_e, id: number, optionId: string) => {
    if (!client) throw new Error("ACP not ready");
    client.respond(id, { optionId });
    return true;
  });

  ipcMain.handle("acp:dispose", () => {
    client?.dispose();
    client = undefined;
    child = undefined;
    sessionId = undefined;
    return true;
  });
}

export function disposeAcp(): void {
  client?.dispose();
  client = undefined;
  child = undefined;
  sessionId = undefined;
}
