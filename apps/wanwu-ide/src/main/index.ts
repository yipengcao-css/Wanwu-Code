import { homedir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { IPC_EVENTS } from "../shared/ipc.js";
import type { AgentEvent } from "../shared/ipc.js";
import { WorkspaceManager } from "./workspace.js";
import { TerminalManager } from "./terminal.js";
import { AgentManager } from "./acp/manager.js";
import { registerIpc } from "./ipc.js";

let mainWindow: BrowserWindow | null = null;

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0d1117",
    title: "Wanwu Code",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const initialCwd = homedir();

  const workspace = new WorkspaceManager((p) => send(IPC_EVENTS.fsChanged, p));
  const terminals = new TerminalManager(
    (id, data) => send(IPC_EVENTS.termData, { id, data }),
    (id, exitCode) => send(IPC_EVENTS.termExit, { id, exitCode }),
  );
  const agent = new AgentManager((event: AgentEvent) => send(IPC_EVENTS.agentEvent, event), initialCwd);

  registerIpc({ window: () => mainWindow, workspace, terminals, agent });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("before-quit", () => {
    terminals.disposeAll();
    agent.dispose();
    void workspace.dispose();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
