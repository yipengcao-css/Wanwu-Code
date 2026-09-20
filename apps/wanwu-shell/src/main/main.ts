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
import {
  disposeLsp,
  onWorkspaceRootChangedForLsp,
  registerLspIpc,
} from "./ipc/lsp.js";
import { disposeTerm, registerTermIpc } from "./ipc/term.js";
import { registerSettingsIpc } from "./ipc/settings.js";
import { registerAiIpc } from "./ipc/ai.js";
import { registerGitIpc } from "./ipc/git.js";
import { registerCkptIpc } from "./ipc/ckpt.js";
import { registerMediaIpc } from "./ipc/media.js";

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
    const alts = [devUrl];
    try {
      const u = new URL(devUrl);
      if (u.hostname === "127.0.0.1") {
        u.hostname = "localhost";
        alts.push(u.toString());
      } else if (u.hostname === "localhost") {
        u.hostname = "127.0.0.1";
        alts.push(u.toString());
      }
    } catch {
      /* keep primary */
    }
    let tries = 0;
    const loadDev = (): void => {
      const url = alts[tries % alts.length] ?? devUrl;
      void mainWindow?.loadURL(url);
    };
    loadDev();
    mainWindow.webContents.on("did-fail-load", (_event, _code, desc, _url, isMainFrame) => {
      if (!isMainFrame || tries >= 24) return;
      if (!/ERR_CONNECTION_REFUSED|ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED/.test(desc)) {
        return;
      }
      tries += 1;
      setTimeout(loadDev, 350);
    });
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
      onWorkspaceRootChangedForLsp(prev, r);
      workspaceRoot = r;
      // Terminal cwd is bound at spawn time; force restart on workspace switch.
      disposeTerm();
      mainWindow?.webContents.send("workspace:changed", r);
    },
    () => mainWindow,
  );
  registerSettingsIpc(() => workspaceRoot);
  registerAiIpc(() => workspaceRoot);
  registerGitIpc(() => workspaceRoot);
  registerCkptIpc(() => workspaceRoot);
  registerMediaIpc(() => workspaceRoot);
  registerAcpIpc(
    () => workspaceRoot,
    () => mainWindow,
  );
  registerLspIpc(
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
  disposeLsp();
  disposeTerm();
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") app.quit();
});
