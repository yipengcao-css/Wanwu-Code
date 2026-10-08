import { app, ipcMain, type BrowserWindow } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AcpClient,
  type AcpEditProposal,
  type AcpPermissionRequest,
} from "@wanwu/acp-client";
import { resolveShellAcpLaunch } from "../acpLaunch.js";
import { isUnknownSessionError, planSessionBind, shouldResetAcpSession } from "../acpSession.js";
import { acpCredentialEnv } from "./settings.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** apps/wanwu-shell/dist/electron → repo root (dev / unpacked). */
function findRepoRoot(): string {
  return path.resolve(here, "../../../../");
}

let client: AcpClient | undefined;
let child: ChildProcessWithoutNullStreams | undefined;
let sessionId: string | undefined;
/** Session ids created or loaded in the current ACP process. */
const liveSessions = new Set<string>();
/** Workspace cwd the current ACP child was launched with. */
let clientCwd: string | undefined;
/** In-flight boot so two ensure() calls share one child. */
let booting: Promise<void> | undefined;
let bootGeneration = 0;

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

function rememberSession(id: string, getWin: () => BrowserWindow | null, cwd: string): string {
  sessionId = id;
  liveSessions.add(id);
  broadcast(getWin(), "acp:session", { sessionId: id, cwd });
  return id;
}

async function bootClient(root: string, getWin: () => BrowserWindow | null): Promise<void> {
  if (client && shouldResetAcpSession(clientCwd, root)) {
    disposeAcp();
  }
  if (client) return;
  const generation = bootGeneration;
  if (!booting) {
    booting = (async () => {
      const next = startNativeAcp(root);
      client = next;
      clientCwd = root;
      next.on("message", (text: string) => broadcast(getWin(), "acp:message", text));
      next.on("thought", (text: string) => broadcast(getWin(), "acp:thought", text));
      next.on("tool", (tool) => broadcast(getWin(), "acp:tool", tool));
      next.on("error", (err: Error) => broadcast(getWin(), "acp:error", err.message));
      // Always re-read the window: a captured `win` is null if ensure() raced createWindow.
      next.on("permission", (req: AcpPermissionRequest) =>
        broadcast(getWin(), "acp:permission", req),
      );
      next.on("edit", (edit: AcpEditProposal) => broadcast(getWin(), "acp:edit", edit));
      try {
        await next.initialize();
      } catch (err) {
        if (client === next) disposeAcp();
        throw err;
      }
    })().finally(() => {
      if (bootGeneration === generation) booting = undefined;
    });
  }
  await booting;
}

/** Serializes session create/load so two ensure() calls cannot mint two ids. */
let binding: Promise<void> | undefined;

/** Select a live session, or load it from disk. Optionally mint a new one if the file is gone. */
async function bindSession(
  root: string,
  getWin: () => BrowserWindow | null,
  requestedId: string | undefined,
  fallbackNew: boolean,
): Promise<string | undefined> {
  while (binding) await binding;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  binding = gate;
  try {
    return await bindSessionUnlocked(root, getWin, requestedId, fallbackNew);
  } finally {
    if (binding === gate) binding = undefined;
    release();
  }
}

async function bindSessionUnlocked(
  root: string,
  getWin: () => BrowserWindow | null,
  requestedId: string | undefined,
  fallbackNew: boolean,
): Promise<string | undefined> {
  if (!client) throw new Error("ACP not ready");
  const plan = planSessionBind(requestedId, liveSessions);
  if (plan === "use") {
    sessionId = requestedId!.trim();
    return sessionId;
  }
  if (plan === "load") {
    try {
      const loaded = await client.loadSession(requestedId!.trim());
      return rememberSession(loaded.sessionId, getWin, clientCwd ?? root);
    } catch (err) {
      if (!fallbackNew) throw err;
    }
  }
  if (!sessionId || plan === "load") {
    const created = await client.newSession(root);
    return rememberSession(created, getWin, root);
  }
  return sessionId;
}

async function ensureClient(
  root: string,
  getWin: () => BrowserWindow | null,
  resumeId?: string,
  opts?: { fallbackNew?: boolean },
): Promise<string | undefined> {
  await bootClient(root, getWin);
  if (!client) throw new Error("ACP not ready");
  return bindSession(root, getWin, resumeId, opts?.fallbackNew !== false);
}

export function registerAcpIpc(getRoot: () => string | null, getWin: () => BrowserWindow | null): void {
  ipcMain.handle("acp:ensure", async (_e, resumeId?: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const id = await ensureClient(root, getWin, resumeId);
    return { sessionId: id, cwd: clientCwd };
  });

  ipcMain.handle(
    "acp:prompt",
    async (
      _e,
      text: string,
      context?: { diagnostics?: string; terminal?: string; images?: string[] },
    ) => {
      const root = getRoot();
      if (!root) throw new Error("no workspace open");
      if (!client || !sessionId) throw new Error("ACP not ready");
      const send = async (): Promise<unknown> => {
        if (!client || !sessionId) throw new Error("ACP not ready");
        if (!liveSessions.has(sessionId)) {
          await bindSession(root, getWin, sessionId, false);
        }
        return client.prompt(sessionId, text, context);
      };
      try {
        return await send();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isUnknownSessionError(message) || !sessionId) throw err;
        liveSessions.delete(sessionId);
        await bindSession(root, getWin, sessionId, false);
        return send();
      }
    },
  );

  /** Start a fresh ACP session on the existing backend (keeps process; clears model history). */
  ipcMain.handle("acp:newChat", async () => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    await ensureClient(root, getWin);
    if (!client) throw new Error("ACP not ready");
    const created = await client.newSession(root);
    rememberSession(created, getWin, root);
    return { sessionId, cwd: root };
  });

  ipcMain.handle("acp:cancel", async () => {
    if (!client || !sessionId) return false;
    await client.cancelSession(sessionId);
    return true;
  });

  ipcMain.handle("acp:setSession", async (_e, nextId: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const id = await ensureClient(root, getWin, String(nextId), { fallbackNew: false });
    return { sessionId: id };
  });

  ipcMain.handle("acp:listSessions", async () => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    await ensureClient(root, getWin);
    if (!client) throw new Error("ACP not ready");
    return client.listSessions();
  });

  ipcMain.handle("acp:loadSession", async (_e, nextId: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    await ensureClient(root, getWin);
    if (!client) throw new Error("ACP not ready");
    try {
      const loaded = await client.loadSession(String(nextId));
      rememberSession(loaded.sessionId, getWin, root);
      return loaded;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/session not found/i.test(message)) {
        return { sessionId: String(nextId), missing: true, history: [] as unknown[] };
      }
      throw err;
    }
  });

  ipcMain.handle("acp:deleteSession", async (_e, rawId: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const id = String(rawId).trim();
    if (!/^[\w.-]+$/.test(id)) throw new Error("invalid session id");
    liveSessions.delete(id);
    if (sessionId === id) sessionId = undefined;
    if (client) {
      try {
        await client.deleteSession(id);
        return { ok: true };
      } catch {
        /* Older backends have no session/delete; remove the file locally. */
      }
    }
    const file = path.join(root, ".wanwu", "sessions", `${id}.json`);
    const rel = path.relative(root, file);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("invalid session path");
    if (existsSync(file)) unlinkSync(file);
    return { ok: true };
  });

  // send/on — not invoke/handle. Nested invoke behind an in-flight acp:prompt
  // deadlocks on Electron (permission click never reaches the ACP child → 120s timeout).
  ipcMain.on("acp:respondPermission", (_e, id: number, optionId: string) => {
    client?.respond(Number(id), { optionId: String(optionId) });
  });

  ipcMain.handle("acp:dispose", () => {
    disposeAcp();
    return true;
  });
}

export function disposeAcp(): void {
  bootGeneration += 1;
  client?.dispose();
  client = undefined;
  child = undefined;
  sessionId = undefined;
  liveSessions.clear();
  clientCwd = undefined;
  booting = undefined;
}

/** Call when the shell workspace root changes (breaks ACP singleton). */
export function onWorkspaceRootChanged(prev: string | null, next: string): void {
  if (shouldResetAcpSession(prev ?? clientCwd, next) || shouldResetAcpSession(clientCwd, next)) {
    disposeAcp();
  }
}
