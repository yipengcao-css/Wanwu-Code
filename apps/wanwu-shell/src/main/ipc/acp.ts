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
import { shouldResetAcpSession } from "../acpSession.js";
import { acpCredentialEnv } from "./settings.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** apps/wanwu-shell/dist/electron → repo root (dev / unpacked). */
function findRepoRoot(): string {
  return path.resolve(here, "../../../../");
}

let client: AcpClient | undefined;
let child: ChildProcessWithoutNullStreams | undefined;
let sessionId: string | undefined;
/** Workspace cwd the current ACP child was launched with. */
let clientCwd: string | undefined;

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
      ...acpCredentialEnv(),
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

async function ensureClient(
  root: string,
  getWin: () => BrowserWindow | null,
): Promise<string | undefined> {
  if (client && shouldResetAcpSession(clientCwd, root)) {
    disposeAcp();
  }
  if (!client) {
    client = startNativeAcp(root);
    clientCwd = root;
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
    broadcast(win, "acp:session", { sessionId, cwd: root });
  }
  return sessionId;
}

export function registerAcpIpc(getRoot: () => string | null, getWin: () => BrowserWindow | null): void {
  ipcMain.handle("acp:ensure", async () => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const id = await ensureClient(root, getWin);
    return { sessionId: id, cwd: clientCwd };
  });

  ipcMain.handle("acp:prompt", async (_e, text: string) => {
    if (!client || !sessionId) throw new Error("ACP not ready");
    return client.prompt(sessionId, text);
  });

  /** Start a fresh ACP session on the existing backend (keeps process; clears model history). */
  ipcMain.handle("acp:newChat", async () => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    await ensureClient(root, getWin);
    if (!client) throw new Error("ACP not ready");
    sessionId = await client.newSession(root);
    const win = getWin();
    broadcast(win, "acp:session", { sessionId, cwd: root });
    return { sessionId, cwd: root };
  });

  ipcMain.handle("acp:setSession", (_e, nextId: string) => {
    if (!client) throw new Error("ACP not ready");
    sessionId = nextId;
    return { sessionId };
  });

  ipcMain.handle("acp:respondPermission", (_e, id: number, optionId: string) => {
    if (!client) throw new Error("ACP not ready");
    client.respond(id, { optionId });
    return true;
  });

  ipcMain.handle("acp:dispose", () => {
    disposeAcp();
    return true;
  });
}

export function disposeAcp(): void {
  client?.dispose();
  client = undefined;
  child = undefined;
  sessionId = undefined;
  clientCwd = undefined;
}

/** Call when the shell workspace root changes (breaks ACP singleton). */
export function onWorkspaceRootChanged(prev: string | null, next: string): void {
  if (shouldResetAcpSession(prev ?? clientCwd, next) || shouldResetAcpSession(clientCwd, next)) {
    disposeAcp();
  }
}
