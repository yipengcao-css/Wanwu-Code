import type {
  AgentEvent,
  AgentMode,
  FileNode,
  GitStatus,
  OpenFileResult,
  SearchMatch,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalInfo,
  WorkspaceInfo,
} from "./ipc.js";

export type BackendChoice = "mock" | "cli";

export interface WanwuApi {
  workspace: {
    current: () => Promise<WorkspaceInfo>;
    openDialog: () => Promise<WorkspaceInfo>;
    openPath: (path: string) => Promise<WorkspaceInfo>;
    onChanged: (cb: (info: WorkspaceInfo) => void) => () => void;
  };
  fs: {
    tree: (dirPath?: string) => Promise<FileNode[]>;
    read: (path: string) => Promise<OpenFileResult>;
    write: (path: string, content: string) => Promise<void>;
    create: (path: string, type: "file" | "directory") => Promise<void>;
    rename: (oldPath: string, newPath: string) => Promise<void>;
    remove: (path: string) => Promise<void>;
    onChanged: (cb: (path: string) => void) => () => void;
  };
  git: {
    status: () => Promise<GitStatus>;
  };
  search: {
    text: (query: string) => Promise<SearchMatch[]>;
  };
  agent: {
    start: (choice?: BackendChoice) => Promise<void>;
    prompt: (mode: AgentMode, text: string) => Promise<void>;
    respondPermission: (id: number, optionId: string) => Promise<void>;
    cancel: () => Promise<void>;
    onEvent: (cb: (event: AgentEvent) => void) => () => void;
  };
  terminal: {
    create: (id: string, cols: number, rows: number) => Promise<TerminalInfo>;
    input: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    dispose: (id: string) => Promise<void>;
    onData: (cb: (event: TerminalDataEvent) => void) => () => void;
    onExit: (cb: (event: TerminalExitEvent) => void) => () => void;
  };
}

declare global {
  interface Window {
    wanwu: WanwuApi;
  }
}
