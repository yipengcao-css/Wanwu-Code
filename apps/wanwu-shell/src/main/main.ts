import {
  app,
  BrowserWindow,
  Menu,
  globalShortcut,
  nativeTheme,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerFsIpc } from "./ipc/fs.js";
import { disposeAcp, onWorkspaceRootChanged, registerAcpIpc } from "./ipc/acp.js";
import { disposeTerm, registerTermIpc } from "./ipc/term.js";
import { registerSettingsIpc } from "./ipc/settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let workspaceRoot: string | null =
  process.env.WANWU_SHELL_WORKSPACE?.trim() ||
  process.argv.find((a) => a.startsWith("--workspace="))?.slice("--workspace=".length) ||
  null;

nativeTheme.themeSource = "dark";

function send(channel: string): void {
  mainWindow?.webContents.send(channel);
}

function wireWindowHotkeys(win: BrowserWindow): void {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const mod = input.control || input.meta;
    if (!mod) return;
    const key = input.key.toLowerCase();
    if (key === "i" && !input.alt && !input.shift) {
      event.preventDefault();
      send("shell:focus-agent");
    } else if (key === "`" && !input.alt) {
      event.preventDefault();
      send("shell:toggle-terminal");
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "Wanwu Code",
    backgroundColor: "#070B14",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);
  wireWindowHotkeys(mainWindow);

  const devUrl = process.env.WANWU_SHELL_DEV_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.webContents.on("did-finish-load", () => {
    // Default: focus Agent Studio after cold start
    setTimeout(() => send("shell:focus-agent"), 200);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerFsIpc(
    () => workspaceRoot,
    (r) => {
      const prev = workspaceRoot;
      onWorkspaceRootChanged(prev, r);
      workspaceRoot = r;
      // Terminal cwd is bound at spawn time; force restart on workspace switch.
      disposeTerm();
      mainWindow?.webContents.send("workspace:changed", r);
    },
  );
  registerSettingsIpc(() => workspaceRoot);
  registerAcpIpc(
    () => workspaceRoot,
    () => mainWindow,
  );
  registerTermIpc(
    () => workspaceRoot,
    () => mainWindow,
  );

  createWindow();

  // Best-effort global shortcuts (may fail if grabbed elsewhere)
  try {
    globalShortcut.register("CommandOrControl+I", () => send("shell:focus-agent"));
    globalShortcut.register("CommandOrControl+`", () => send("shell:toggle-terminal"));
  } catch {
    /* ignore */
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  disposeAcp();
  disposeTerm();
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") app.quit();
});
