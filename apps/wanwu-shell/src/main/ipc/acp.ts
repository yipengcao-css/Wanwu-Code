import { app, ipcMain, type BrowserWindow } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AcpClient,
  type AcpEditProposal,
  type AcpPermissionRequest,
} from "@wanwu/acp-client";
import { agentEnv } from "../settings.js";

const here = path.dirname(fileURLToPath(import.meta.url));

let client: AcpClient | undefined;
let child: ChildProcessWithoutNullStreams | undefined;
let sessionId: string | undefined;

function broadcast(win: BrowserWindow | null, channel: string, payload: unknown): void {
  win?.webContents.send(channel, payload);
}

/**
 * Locate the bundled single-file ACP backend.
 *
 * P0-1: the shell ships its own bundled Node backend and never depends on
 * `pnpm`/`tsx` or a monorepo checkout. Packaged builds place it under
 * `resources/backend` (electron-builder extraResources); dev/unpackaged builds
 * read it from `dist/backend` next to the compiled main process.
 */
function resolveBackendScript(): string {
  const candidates = [
    path.join(process.resourcesPath ?? "", "backend", "wanwu-acp.mjs"),
    path.join(here, "..", "backend", "wanwu-acp.mjs"),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Bundled ACP backend not found. Looked in: ${candidates.join(", ")}. Run the shell build.`,
  );
}

/**
 * Start the wanwu-native ACP backend. Launched with the bundled Electron binary
 * running as plain Node (`ELECTRON_RUN_AS_NODE`), so no system Node/pnpm/tsx is
 * required. `WANWU_ACP_COMMAND` can override the whole command line for advanced
 * setups (e.g. bridging to grok).
 */
function startAcpBackend(cwd: string): AcpClient {
  // Settings-driven provider/model/API-key env (P2: model selection + API key UI).
  const injected = agentEnv();
  const override = process.env.WANWU_ACP_COMMAND?.trim();
  if (override) {
    const parts = override.split(/\s+/);
    child = spawn(parts[0]!, parts.slice(1), {
      cwd,
      env: { ...process.env, ...injected, WANWU_WORKSPACE_ROOT: cwd },
      stdio: ["pipe", "pipe", "pipe"],
    });
  } else {
    const script = resolveBackendScript();
    child = spawn(process.execPath, [script], {
      cwd,
      env: {
        ...process.env,
        ...injected,
        ELECTRON_RUN_AS_NODE: "1",
        WANWU_INTERNAL_ACP: "1",
        WANWU_WORKSPACE_ROOT: cwd,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
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
      client = startAcpBackend(root);
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
    return { sessionId, backend: app.isPackaged ? "packaged" : "dev" };
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
    disposeAcp();
    return true;
  });
}

export function disposeAcp(): void {
  client?.dispose();
  client = undefined;
  child = undefined;
  sessionId = undefined;
}
