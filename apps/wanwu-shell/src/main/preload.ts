import { contextBridge, ipcRenderer } from "electron";

export type WanwuBridge = {
  workspace: {
    getRoot: () => Promise<string | null>;
    openDialog: () => Promise<string | null>;
    openPath: (dir: string) => Promise<string>;
    onChanged: (cb: (root: string) => void) => () => void;
  };
  fs: {
    list: (rel?: string) => Promise<{ name: string; path: string; type: "file" | "dir" }[]>;
    read: (rel: string) => Promise<string>;
    write: (rel: string, content: string) => Promise<boolean>;
  };
  acp: {
    ensure: () => Promise<{ sessionId?: string; cwd?: string }>;
    newChat: () => Promise<{ sessionId?: string; cwd?: string }>;
    setSession: (sessionId: string) => Promise<{ sessionId?: string }>;
    prompt: (text: string) => Promise<unknown>;
    respondPermission: (id: number, optionId: string) => Promise<boolean>;
    dispose: () => Promise<boolean>;
    onMessage: (cb: (text: string) => void) => () => void;
    onTool: (cb: (tool: { title: string; status: string; detail?: string }) => void) => () => void;
    onError: (cb: (text: string) => void) => () => void;
    onSession: (cb: (info: { sessionId?: string; cwd?: string }) => void) => () => void;
    onPermission: (
      cb: (req: { id: number; toolName: string; summary: string; risk?: string }) => void,
    ) => () => void;
    onEdit: (
      cb: (edit: { path: string; before: string; after: string }) => void,
    ) => () => void;
  };
  term: {
    start: (cols?: number, rows?: number) => Promise<boolean>;
    write: (data: string) => Promise<boolean>;
    resize: (cols: number, rows: number) => Promise<boolean>;
    stop: () => Promise<boolean>;
    onData: (cb: (data: string) => void) => () => void;
  };
  shell: {
    onFocusAgent: (cb: () => void) => () => void;
    onToggleTerminal: (cb: () => void) => () => void;
  };
  settings: {
    get: () => Promise<{
      activeProvider: string;
      model: string;
      baseUrl: string;
      hasApiKey: boolean;
      configPath: string;
      sources: string[];
    }>;
    save: (patch: {
      activeProvider?: string;
      model?: string;
      baseUrl?: string;
      apiKey?: string;
    }) => Promise<{
      activeProvider: string;
      model: string;
      baseUrl: string;
      hasApiKey: boolean;
      configPath: string;
      sources: string[];
    }>;
  };
};

function on(channel: string, cb: (...args: unknown[]) => void): () => void {
  const listener = (_: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const bridge: WanwuBridge = {
  workspace: {
    getRoot: () => ipcRenderer.invoke("workspace:getRoot"),
    openDialog: () => ipcRenderer.invoke("workspace:openDialog"),
    openPath: (dir) => ipcRenderer.invoke("workspace:openPath", dir),
    onChanged: (cb) => on("workspace:changed", (r) => cb(String(r))),
  },
  fs: {
    list: (rel) => ipcRenderer.invoke("fs:list", rel),
    read: (rel) => ipcRenderer.invoke("fs:read", rel),
    write: (rel, content) => ipcRenderer.invoke("fs:write", rel, content),
  },
  acp: {
    ensure: () => ipcRenderer.invoke("acp:ensure"),
    newChat: () => ipcRenderer.invoke("acp:newChat"),
    setSession: (sessionId) => ipcRenderer.invoke("acp:setSession", sessionId),
    prompt: (text) => ipcRenderer.invoke("acp:prompt", text),
    respondPermission: (id, optionId) => ipcRenderer.invoke("acp:respondPermission", id, optionId),
    dispose: () => ipcRenderer.invoke("acp:dispose"),
    onMessage: (cb) => on("acp:message", (t) => cb(String(t))),
    onTool: (cb) => on("acp:tool", (t) => cb(t as never)),
    onError: (cb) => on("acp:error", (t) => cb(String(t))),
    onSession: (cb) => on("acp:session", (t) => cb(t as never)),
    onPermission: (cb) => on("acp:permission", (t) => cb(t as never)),
    onEdit: (cb) => on("acp:edit", (t) => cb(t as never)),
  },
  term: {
    start: (cols, rows) => ipcRenderer.invoke("term:start", cols, rows),
    write: (data) => ipcRenderer.invoke("term:write", data),
    resize: (cols, rows) => ipcRenderer.invoke("term:resize", cols, rows),
    stop: () => ipcRenderer.invoke("term:stop"),
    onData: (cb) => on("term:data", (t) => cb(String(t))),
  },
  shell: {
    onFocusAgent: (cb) => on("shell:focus-agent", () => cb()),
    onToggleTerminal: (cb) => on("shell:toggle-terminal", () => cb()),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (patch) => ipcRenderer.invoke("settings:save", patch),
  },
};

contextBridge.exposeInMainWorld("wanwu", bridge);
