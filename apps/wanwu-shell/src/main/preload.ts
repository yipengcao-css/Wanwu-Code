import { contextBridge, ipcRenderer } from "electron";
import type { SettingsView, SettingsPatch, ProviderId } from "./settings.js";

export type { SettingsView, SettingsPatch, ProviderId };

export type WanwuBridge = {
  workspace: {
    getRoot: () => Promise<string | null>;
    openDialog: () => Promise<string | null>;
    openPath: (dir: string) => Promise<string>;
  };
  fs: {
    list: (rel?: string) => Promise<{ name: string; path: string; type: "file" | "dir" }[]>;
    read: (rel: string) => Promise<{ content: string; binary: boolean }>;
    write: (rel: string, content: string) => Promise<boolean>;
    create: (parentRel: string, name: string, type: "file" | "dir") => Promise<string>;
    rename: (rel: string, newName: string) => Promise<string>;
    remove: (rel: string) => Promise<boolean>;
    allFiles: () => Promise<string[]>;
    onChanged: (cb: () => void) => () => void;
  };
  settings: {
    get: () => Promise<SettingsView>;
    set: (patch: SettingsPatch) => Promise<SettingsView>;
  };
  verify: {
    run: (command?: string) => Promise<{ ok: boolean; command: string }>;
    cancel: () => Promise<boolean>;
    onData: (cb: (chunk: string) => void) => () => void;
    onDone: (cb: (result: { exitCode: number }) => void) => () => void;
  };
  search: {
    text: (query: string) => Promise<{ path: string; line: number; preview: string }[]>;
  };
  git: {
    status: () => Promise<{
      available: boolean;
      branch: string | null;
      entries: { path: string; index: string; workingTree: string }[];
    }>;
    commit: (message: string) => Promise<{ ok: boolean; output: string }>;
  };
  acp: {
    ensure: () => Promise<{ sessionId?: string }>;
    prompt: (text: string) => Promise<unknown>;
    respondPermission: (id: number, optionId: string) => Promise<boolean>;
    dispose: () => Promise<boolean>;
    onMessage: (cb: (text: string) => void) => () => void;
    onTool: (cb: (tool: { title: string; status: string; detail?: string }) => void) => () => void;
    onError: (cb: (text: string) => void) => () => void;
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
  },
  fs: {
    list: (rel) => ipcRenderer.invoke("fs:list", rel),
    read: (rel) => ipcRenderer.invoke("fs:read", rel),
    write: (rel, content) => ipcRenderer.invoke("fs:write", rel, content),
    create: (parentRel, name, type) => ipcRenderer.invoke("fs:create", parentRel, name, type),
    rename: (rel, newName) => ipcRenderer.invoke("fs:rename", rel, newName),
    remove: (rel) => ipcRenderer.invoke("fs:delete", rel),
    allFiles: () => ipcRenderer.invoke("fs:allFiles"),
    onChanged: (cb) => on("fs:changed", () => cb()),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch) => ipcRenderer.invoke("settings:set", patch),
  },
  verify: {
    run: (command) => ipcRenderer.invoke("verify:run", command),
    cancel: () => ipcRenderer.invoke("verify:cancel"),
    onData: (cb) => on("verify:data", (c) => cb(String(c))),
    onDone: (cb) => on("verify:done", (r) => cb(r as { exitCode: number })),
  },
  search: {
    text: (query) => ipcRenderer.invoke("search:text", query),
  },
  git: {
    status: () => ipcRenderer.invoke("git:status"),
    commit: (message) => ipcRenderer.invoke("git:commit", message),
  },
  acp: {
    ensure: () => ipcRenderer.invoke("acp:ensure"),
    prompt: (text) => ipcRenderer.invoke("acp:prompt", text),
    respondPermission: (id, optionId) => ipcRenderer.invoke("acp:respondPermission", id, optionId),
    dispose: () => ipcRenderer.invoke("acp:dispose"),
    onMessage: (cb) => on("acp:message", (t) => cb(String(t))),
    onTool: (cb) => on("acp:tool", (t) => cb(t as never)),
    onError: (cb) => on("acp:error", (t) => cb(String(t))),
    onPermission: (cb) => on("acp:permission", (t) => cb(t as never)),
    onEdit: (cb) => on("acp:edit", (t) => cb(t as never)),
  },
  term: {
    start: (cols, rows) => ipcRenderer.invoke("term:start", { cols, rows }),
    write: (data) => ipcRenderer.invoke("term:write", data),
    resize: (cols, rows) => ipcRenderer.invoke("term:resize", cols, rows),
    stop: () => ipcRenderer.invoke("term:stop"),
    onData: (cb) => on("term:data", (t) => cb(String(t))),
  },
  shell: {
    onFocusAgent: (cb) => on("shell:focus-agent", () => cb()),
    onToggleTerminal: (cb) => on("shell:toggle-terminal", () => cb()),
  },
};

contextBridge.exposeInMainWorld("wanwu", bridge);
