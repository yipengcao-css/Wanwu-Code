import { dialog, ipcMain, type BrowserWindow } from "electron";
import { IPC } from "../shared/ipc.js";
import type { AgentMode } from "../shared/ipc.js";
import type { WorkspaceManager } from "./workspace.js";
import type { TerminalManager } from "./terminal.js";
import type { AgentManager } from "./acp/manager.js";
import type { BackendChoice } from "./acp/resolveBackend.js";
import { gitStatus } from "./git.js";
import { searchText } from "./search.js";
import { saveLastWorkspace } from "./state.js";

export interface Managers {
  window: () => BrowserWindow | null;
  workspace: WorkspaceManager;
  terminals: TerminalManager;
  agent: AgentManager;
}

export function registerIpc(m: Managers): void {
  ipcMain.handle(IPC.workspaceCurrent, () => m.workspace.info());

  ipcMain.handle(IPC.workspaceOpenDialog, async () => {
    const win = m.window();
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return m.workspace.info();
    return openWorkspace(m, result.filePaths[0]!);
  });

  ipcMain.handle(IPC.workspaceOpenPath, async (_e, path: string) => openWorkspace(m, path));

  ipcMain.handle(IPC.fsTree, async (_e, dirPath?: string) => m.workspace.list(dirPath));
  ipcMain.handle(IPC.fsRead, async (_e, path: string) => m.workspace.read(path));
  ipcMain.handle(IPC.fsWrite, async (_e, path: string, content: string) => m.workspace.write(path, content));
  ipcMain.handle(IPC.fsCreate, async (_e, path: string, type: "file" | "directory") =>
    m.workspace.create(path, type),
  );
  ipcMain.handle(IPC.fsRename, async (_e, oldPath: string, newPath: string) =>
    m.workspace.rename(oldPath, newPath),
  );
  ipcMain.handle(IPC.fsDelete, async (_e, path: string) => m.workspace.remove(path));

  ipcMain.handle(IPC.gitStatus, async () => gitStatus(m.workspace.info().root));
  ipcMain.handle(IPC.searchText, async (_e, query: string) =>
    searchText(m.workspace.info().root, query),
  );

  ipcMain.handle(IPC.agentInfo, async () => {
    await m.agent.ensureStarted();
    return { cwd: m.agent.currentCwd };
  });
  ipcMain.handle(IPC.agentStart, async (_e, choice?: BackendChoice) => {
    if (choice) m.agent.setBackend(choice);
    await m.agent.ensureStarted();
  });
  ipcMain.handle(IPC.agentPrompt, async (_e, mode: AgentMode, text: string) => m.agent.prompt(mode, text));
  ipcMain.handle(IPC.agentRespondPermission, async (_e, id: number, optionId: string) =>
    m.agent.respondPermission(id, optionId),
  );
  ipcMain.handle(IPC.agentCancel, async () => m.agent.dispose());

  ipcMain.handle(IPC.termCreate, async (_e, id: string, cols: number, rows: number) => {
    const cwd = m.workspace.info().root ?? m.agent.currentCwd;
    return m.terminals.create(id, cols, rows, cwd);
  });
  ipcMain.handle(IPC.termInput, async (_e, id: string, data: string) => m.terminals.write(id, data));
  ipcMain.handle(IPC.termResize, async (_e, id: string, cols: number, rows: number) =>
    m.terminals.resize(id, cols, rows),
  );
  ipcMain.handle(IPC.termDispose, async (_e, id: string) => m.terminals.dispose(id));
}

async function openWorkspace(m: Managers, path: string) {
  const info = await m.workspace.setRoot(path);
  saveLastWorkspace(path);
  // P0-3: rebuild the ACP backend/session so it points at the new folder.
  await m.agent.restartForWorkspace(path);
  return info;
}
