/**
 * Shared IPC contract between the Electron main process, the preload bridge,
 * and the renderer. Keep this file free of runtime imports so it can be shared
 * across all three build targets.
 */

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface WorkspaceInfo {
  root: string | null;
  name: string | null;
}

export interface OpenFileResult {
  path: string;
  content: string;
  /** True when the file could not be decoded as UTF-8 text. */
  binary: boolean;
}

export type AgentMode = "ask" | "plan" | "agent" | "verify";

export interface AgentBackendInfo {
  backend: string;
  command: string;
  args: string[];
  packaged: boolean;
}

export interface AgentMessageEvent {
  kind: "message";
  text: string;
}

export interface AgentToolEvent {
  kind: "tool";
  title: string;
  status: string;
  detail?: string;
}

export interface AgentEditEvent {
  kind: "edit";
  path: string;
  before: string;
  after: string;
}

export interface AgentPermissionEvent {
  kind: "permission";
  id: number;
  toolName: string;
  summary: string;
  risk?: string;
}

export interface AgentStatusEvent {
  kind: "status";
  status: "starting" | "ready" | "thinking" | "idle" | "error" | "exited";
  detail?: string;
  sessionId?: string;
  backend?: AgentBackendInfo;
}

export type AgentEvent =
  | AgentMessageEvent
  | AgentToolEvent
  | AgentEditEvent
  | AgentPermissionEvent
  | AgentStatusEvent;

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number;
}

export interface TerminalCreateOptions {
  id: string;
  cols: number;
  rows: number;
}

export interface TerminalInfo {
  id: string;
  shell: string;
  cwd: string;
}

/** Renderer → main (invoke/handle). */
export const IPC = {
  workspaceOpenDialog: "workspace:openDialog",
  workspaceOpenPath: "workspace:openPath",
  workspaceCurrent: "workspace:current",
  fsTree: "fs:tree",
  fsRead: "fs:read",
  fsWrite: "fs:write",
  fsCreate: "fs:create",
  fsRename: "fs:rename",
  fsDelete: "fs:delete",
  gitStatus: "git:status",
  searchText: "search:text",
  agentStart: "agent:start",
  agentPrompt: "agent:prompt",
  agentRespondPermission: "agent:respondPermission",
  agentCancel: "agent:cancel",
  agentInfo: "agent:info",
  termCreate: "term:create",
  termInput: "term:input",
  termResize: "term:resize",
  termDispose: "term:dispose",
} as const;

/** Main → renderer (send/on). */
export const IPC_EVENTS = {
  agentEvent: "agent:event",
  termData: "term:data",
  termExit: "term:exit",
  fsChanged: "fs:changed",
  workspaceChanged: "workspace:changed",
} as const;

export interface GitStatusEntry {
  path: string;
  index: string;
  workingTree: string;
}

export interface GitStatus {
  available: boolean;
  branch: string | null;
  entries: GitStatusEntry[];
}

export interface SearchMatch {
  path: string;
  line: number;
  preview: string;
}
