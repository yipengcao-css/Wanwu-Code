import { contextBridge, ipcRenderer } from "electron";
import { IPC, IPC_EVENTS } from "../shared/ipc.js";
import type {
  AgentEvent,
  AgentMode,
  TerminalDataEvent,
  TerminalExitEvent,
  WorkspaceInfo,
} from "../shared/ipc.js";
import type { BackendChoice, WanwuApi } from "../shared/api.js";

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: WanwuApi = {
  workspace: {
    current: () => ipcRenderer.invoke(IPC.workspaceCurrent),
    openDialog: () => ipcRenderer.invoke(IPC.workspaceOpenDialog),
    openPath: (path) => ipcRenderer.invoke(IPC.workspaceOpenPath, path),
    onChanged: (cb) => subscribe<WorkspaceInfo>(IPC_EVENTS.workspaceChanged, cb),
  },
  fs: {
    tree: (dirPath) => ipcRenderer.invoke(IPC.fsTree, dirPath),
    read: (path) => ipcRenderer.invoke(IPC.fsRead, path),
    write: (path, content) => ipcRenderer.invoke(IPC.fsWrite, path, content),
    create: (path, type) => ipcRenderer.invoke(IPC.fsCreate, path, type),
    rename: (oldPath, newPath) => ipcRenderer.invoke(IPC.fsRename, oldPath, newPath),
    remove: (path) => ipcRenderer.invoke(IPC.fsDelete, path),
    onChanged: (cb) => subscribe<string>(IPC_EVENTS.fsChanged, cb),
  },
  git: {
    status: () => ipcRenderer.invoke(IPC.gitStatus),
  },
  search: {
    text: (query) => ipcRenderer.invoke(IPC.searchText, query),
  },
  agent: {
    start: (choice?: BackendChoice) => ipcRenderer.invoke(IPC.agentStart, choice),
    prompt: (mode: AgentMode, text: string) => ipcRenderer.invoke(IPC.agentPrompt, mode, text),
    respondPermission: (id, optionId) => ipcRenderer.invoke(IPC.agentRespondPermission, id, optionId),
    cancel: () => ipcRenderer.invoke(IPC.agentCancel),
    onEvent: (cb) => subscribe<AgentEvent>(IPC_EVENTS.agentEvent, cb),
  },
  terminal: {
    create: (id, cols, rows) => ipcRenderer.invoke(IPC.termCreate, id, cols, rows),
    input: (id, data) => ipcRenderer.invoke(IPC.termInput, id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke(IPC.termResize, id, cols, rows),
    dispose: (id) => ipcRenderer.invoke(IPC.termDispose, id),
    onData: (cb) => subscribe<TerminalDataEvent>(IPC_EVENTS.termData, cb),
    onExit: (cb) => subscribe<TerminalExitEvent>(IPC_EVENTS.termExit, cb),
  },
};

contextBridge.exposeInMainWorld("wanwu", api);
