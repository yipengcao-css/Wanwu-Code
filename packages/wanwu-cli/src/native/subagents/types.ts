import type { ChatMessage } from "@wanwu/providers";
import type { PermissionMode, WanwuConfig, WanwuMode } from "@wanwu/config";

export type SubagentKind = "explore" | "coder" | "plan";

export interface SubagentSpec {
  kind: SubagentKind;
  prompt: string;
  name?: string;
}

export interface SubagentToolPolicy {
  allowedTools: ReadonlySet<string>;
  mode: WanwuMode;
  maxTurns: number;
}

export interface SubagentRunOptions {
  parentSessionId: string;
  workspaceRoot: string;
  permissionMode: PermissionMode;
  config: WanwuConfig;
  concurrency?: number;
  fetchImpl?: typeof fetch;
}

export interface SubagentResult {
  id: string;
  kind: SubagentKind;
  name: string;
  ok: boolean;
  summary: string;
  toolsUsed: string[];
  /** Never merged into parent history */
  history: ChatMessage[];
  error?: string;
}

export interface SubagentBatchResult {
  results: SubagentResult[];
  aggregateText: string;
}
