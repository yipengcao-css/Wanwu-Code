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
import { disposeAcp, registerAcpIpc } from "./ipc/acp.js";
import { disposeTerm, registerTermIpc } from "./ipc/term.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let workspaceRoot: string | null =
  process.env.WANWU_SHELL_WORKSPACE?.trim() ||
  process.argv.find((a) => a.startsWith("--workspace="))?.slice("--workspace=".length) ||
  null;

nativeTheme.themeSource = "dark";

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

  const devUrl = process.env.WANWU_SHELL_DEV_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerFsIpc(
    () => workspaceRoot,
    (r) => {
      workspaceRoot = r;
    },
  );
  registerAcpIpc(
    () => workspaceRoot,
    () => mainWindow,
  );
  registerTermIpc(
    () => workspaceRoot,
    () => mainWindow,
  );

  createWindow();

  globalShortcut.register("CommandOrControl+I", () => {
    mainWindow?.webContents.send("shell:focus-agent");
  });
  globalShortcut.register("CommandOrControl+`", () => {
    mainWindow?.webContents.send("shell:toggle-terminal");
  });

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
