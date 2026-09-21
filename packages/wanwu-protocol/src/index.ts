/**
 * Shared protocol types for Wanwu-Code.
 * Canonical sources: @wanwu/config (config/mode/provider ids) and
 * @wanwu/providers (streaming wire types). This package re-exports them so
 * there is exactly one definition; ACP wire types get locked from the
 * upstream schema here in a later PR.
 */

export type {
  ProviderId,
  WanwuMode,
  AcpBackend,
  PermissionMode,
  SandboxMode,
} from "@wanwu/config";

export type { StreamChunk, ToolCall, Usage } from "@wanwu/providers";

export interface PermissionRequest {
  id: string;
  toolName: string;
  summary: string;
  risk: "low" | "medium" | "high";
}

export type PermissionDecision = "allow-once" | "allow-session" | "deny";

export const ACP_SCHEMA_VERSION = "0.1.0-wanwu-native";

export function isWanwuMode(value: string): value is import("@wanwu/config").WanwuMode {
  return (
    value === "ask" ||
    value === "plan" ||
    value === "agent" ||
    value === "verify" ||
    value === "debug"
  );
}
