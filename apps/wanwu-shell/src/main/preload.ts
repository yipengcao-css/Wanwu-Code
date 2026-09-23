import { contextBridge, ipcRenderer } from "electron";

export type WanwuBridge = {
  workspace: {
    getRoot: () => Promise<string | null>;
    openDialog: () => Promise<string | null>;
    openPath: (dir: string) => Promise<string>;
    /** No folder open: create `Desktop/Wanwu-<task>` and use it as the workspace. */
    ensureDesktop: (prompt?: string) => Promise<{ root: string; created: boolean }>;
    onChanged: (cb: (root: string) => void) => () => void;
  };
  fs: {
    list: (rel?: string) => Promise<{ name: string; path: string; type: "file" | "dir" }[]>;
    read: (rel: string) => Promise<string>;
    write: (rel: string, content: string) => Promise<boolean>;
    search: (query: string) => Promise<Array<{ path: string; line: number; text: string }>>;
    listFiles: () => Promise<string[]>;
    onChanged: (cb: (rel: string) => void) => () => void;
  };
  git: {
    status: () => Promise<Array<{ path: string; code: string; raw: string }>>;
  };
  ckpt: {
    list: () => Promise<Array<{ id: string; createdAt: string; files: number }>>;
    restore: (id?: string) => Promise<{
      id: string;
      restored: string[];
      deleted: string[];
      missing: string[];
    }>;
  };
  media: {
    saveImage: (payload: { name?: string; mime?: string; dataBase64: string }) => Promise<string>;
    pickImages: () => Promise<string[]>;
  };
  skills: {
    list: () => Promise<
      Array<{ id: string; name: string; source: "workspace" | "agents" | "user"; summary: string }>
    >;
    pickMarkdown: () => Promise<{ id: string; name: string; path: string; summary: string } | null>;
    readMarkdown: (absPath: string) => Promise<{ id: string; name: string; path: string; summary: string }>;
    save: (req: {
      dest: "workspace" | "user";
      name?: string;
      body: string;
    }) => Promise<{ id: string; name: string; path: string }>;
    draft: (req: { brief: string; name?: string }) => Promise<{ markdown: string; model?: string; error?: string }>;
  };
  ai: {
    complete: (req: {
      prefix: string;
      suffix: string;
      language?: string;
      path?: string;
      diagnostics?: string;
    }) => Promise<{ text: string; model?: string; error?: string }>;
    inlineEdit: (req: {
      instruction: string;
      selection: string;
      language?: string;
      path?: string;
      before?: string;
      after?: string;
    }) => Promise<{ text: string; model?: string; error?: string }>;
    terminalAsk: (req: {
      instruction: string;
      output?: string;
    }) => Promise<{ text: string; model?: string; error?: string }>;
  };
  acp: {
    ensure: () => Promise<{ sessionId?: string; cwd?: string }>;
    newChat: () => Promise<{ sessionId?: string; cwd?: string }>;
    setSession: (sessionId: string) => Promise<{ sessionId?: string }>;
    prompt: (
      text: string,
      context?: { diagnostics?: string; terminal?: string; images?: string[] },
    ) => Promise<{
      stopReason?: string;
      usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
      checkpointId?: string;
    }>;
    cancel: () => Promise<boolean>;
    listSessions: () => Promise<{
      sessions: Array<{
        id: string;
        createdAt?: string;
        updatedAt?: string;
        messages?: number;
        preview?: string;
      }>;
    }>;
    loadSession: (sessionId: string) => Promise<{ sessionId: string; history?: unknown[] }>;
    respondPermission: (id: number, optionId: string) => Promise<boolean>;
    dispose: () => Promise<boolean>;
    onMessage: (cb: (text: string) => void) => () => void;
    onThought: (cb: (text: string) => void) => () => void;
    onTool: (
      cb: (tool: { id?: string; title: string; status: string; detail?: string }) => void,
    ) => () => void;
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
    start: (id: string, cols?: number, rows?: number) => Promise<boolean>;
    write: (id: string, data: string) => Promise<boolean>;
    resize: (id: string, cols: number, rows: number) => Promise<boolean>;
    stop: (id: string) => Promise<boolean>;
    onData: (cb: (payload: { id: string; data: string }) => void) => () => void;
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
      permissionMode: string;
      hasApiKey: boolean;
      configPath: string;
      sources: string[];
    }>;
    save: (patch: {
      activeProvider?: string;
      model?: string;
      baseUrl?: string;
      apiKey?: string;
      permissionMode?: string;
    }) => Promise<{
      activeProvider: string;
      model: string;
      baseUrl: string;
      permissionMode: string;
      hasApiKey: boolean;
      configPath: string;
      sources: string[];
    }>;
  };
  lsp: {
    ensure: () => Promise<{ ok: boolean; reason?: string }>;
    didOpen: (path: string, text: string) => Promise<boolean>;
    didChange: (path: string, text: string) => Promise<boolean>;
    didClose: (path: string) => Promise<boolean>;
    request: (
      path: string,
      method: string,
      line: number,
      character: number,
      extra?: Record<string, unknown>,
    ) => Promise<unknown>;
    dispose: () => Promise<boolean>;
    onDiagnostics: (
      cb: (payload: {
        path: string;
        uri: string;
        diagnostics: Array<{
          message: string;
          severity: "error" | "warning" | "info" | "hint";
          startLine: number;
          startCharacter: number;
          endLine: number;
          endCharacter: number;
          source?: string;
          code?: string | number;
        }>;
      }) => void,
    ) => () => void;
    onError: (cb: (text: string) => void) => () => void;
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
    ensureDesktop: (prompt) => ipcRenderer.invoke("workspace:ensureDesktop", prompt),
    onChanged: (cb) => on("workspace:changed", (r) => cb(String(r))),
  },
  fs: {
    list: (rel) => ipcRenderer.invoke("fs:list", rel),
    read: (rel) => ipcRenderer.invoke("fs:read", rel),
    write: (rel, content) => ipcRenderer.invoke("fs:write", rel, content),
    search: (query) => ipcRenderer.invoke("fs:search", query),
    listFiles: () => ipcRenderer.invoke("fs:listFiles"),
    onChanged: (cb) => on("fs:changed", (rel) => cb(String(rel))),
  },
  git: {
    status: () => ipcRenderer.invoke("git:status"),
  },
  ckpt: {
    list: () => ipcRenderer.invoke("ckpt:list"),
    restore: (id) => ipcRenderer.invoke("ckpt:restore", id),
  },
  media: {
    saveImage: (payload) => ipcRenderer.invoke("media:saveImage", payload),
    pickImages: () => ipcRenderer.invoke("media:pickImages"),
  },
  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
    pickMarkdown: () => ipcRenderer.invoke("skills:pickMarkdown"),
    readMarkdown: (absPath) => ipcRenderer.invoke("skills:readMarkdown", absPath),
    save: (req) => ipcRenderer.invoke("skills:save", req),
    draft: (req) => ipcRenderer.invoke("skills:draft", req),
  },
  ai: {
    complete: (req) => ipcRenderer.invoke("ai:complete", req),
    inlineEdit: (req) => ipcRenderer.invoke("ai:inlineEdit", req),
    terminalAsk: (req) => ipcRenderer.invoke("ai:terminalAsk", req),
  },
  acp: {
    ensure: () => ipcRenderer.invoke("acp:ensure"),
    newChat: () => ipcRenderer.invoke("acp:newChat"),
    setSession: (sessionId) => ipcRenderer.invoke("acp:setSession", sessionId),
    prompt: (text, context) => ipcRenderer.invoke("acp:prompt", text, context),
    cancel: () => ipcRenderer.invoke("acp:cancel"),
    listSessions: () => ipcRenderer.invoke("acp:listSessions"),
    loadSession: (sessionId) => ipcRenderer.invoke("acp:loadSession", sessionId),
    respondPermission: (id, optionId) => {
      ipcRenderer.send("acp:respondPermission", id, optionId);
      return Promise.resolve(true);
    },
    dispose: () => ipcRenderer.invoke("acp:dispose"),
    onMessage: (cb) => on("acp:message", (t) => cb(String(t))),
    onThought: (cb) => on("acp:thought", (t) => cb(String(t))),
    onTool: (cb) => on("acp:tool", (t) => cb(t as never)),
    onError: (cb) => on("acp:error", (t) => cb(String(t))),
    onSession: (cb) => on("acp:session", (t) => cb(t as never)),
    onPermission: (cb) => on("acp:permission", (t) => cb(t as never)),
    onEdit: (cb) => on("acp:edit", (t) => cb(t as never)),
  },
  term: {
    start: (id, cols, rows) => ipcRenderer.invoke("term:start", id, cols, rows),
    write: (id, data) => ipcRenderer.invoke("term:write", id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke("term:resize", id, cols, rows),
    stop: (id) => ipcRenderer.invoke("term:stop", id),
    onData: (cb) => on("term:data", (p) => cb(p as never)),
  },
  shell: {
    onFocusAgent: (cb) => on("shell:focus-agent", () => cb()),
    onToggleTerminal: (cb) => on("shell:toggle-terminal", () => cb()),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (patch) => ipcRenderer.invoke("settings:save", patch),
  },
  lsp: {
    ensure: () => ipcRenderer.invoke("lsp:ensure"),
    didOpen: (path, text) => ipcRenderer.invoke("lsp:didOpen", path, text),
    didChange: (path, text) => ipcRenderer.invoke("lsp:didChange", path, text),
    didClose: (path) => ipcRenderer.invoke("lsp:didClose", path),
    request: (path, method, line, character, extra) =>
      ipcRenderer.invoke("lsp:request", path, method, line, character, extra),
    dispose: () => ipcRenderer.invoke("lsp:dispose"),
    onDiagnostics: (cb) => on("lsp:diagnostics", (p) => cb(p as never)),
    onError: (cb) => on("lsp:error", (t) => cb(String(t))),
  },
};

contextBridge.exposeInMainWorld("wanwu", bridge);
