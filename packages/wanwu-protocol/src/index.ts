/**
 * Shared protocol types for Wanwu-Code.
 * ACP wire types will be generated/locked from upstream schema in a later PR.
 */

export type WanwuMode = "ask" | "plan" | "agent" | "verify";

export type AcpBackend = "grok" | "wanwu-native";

export type ProviderId = "xai" | "openai" | "anthropic" | "ollama" | "custom";

export interface StreamChunk {
  type: "text" | "thinking" | "tool" | "diff" | "status";
  text?: string;
  toolName?: string;
  status?: string;
}

export interface PermissionRequest {
  id: string;
  toolName: string;
  summary: string;
  risk: "low" | "medium" | "high";
}

export type PermissionDecision = "allow-once" | "allow-session" | "deny";

export const ACP_SCHEMA_VERSION = "0.1.0-wanwu-placeholder";

export function isWanwuMode(value: string): value is WanwuMode {
  return value === "ask" || value === "plan" || value === "agent" || value === "verify";
}