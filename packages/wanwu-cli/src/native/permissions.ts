import { randomInt } from "node:crypto";
import type { PermissionMode } from "@wanwu/config";
import { assessBash, assessToolCall, type PermissionVerdict } from "../permission.js";
import { loadPermissionsFile, matchPermissionRule } from "../permissionsFile.js";
import { send } from "./jsonRpcStdio.js";

type PermissionOptionId = "allow-once" | "allow-session" | "deny";

type PendingPermission = {
  resolve: (optionId: PermissionOptionId) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

const pending = new Map<number, PendingPermission>();
let nextRequestId = 1_000_000;

/** Called by acpServer when the client responds to session/request_permission. */
export function resolvePermissionRequest(
  id: number,
  optionId: string,
): boolean {
  const p = pending.get(id);
  if (!p) return false;
  pending.delete(id);
  clearTimeout(p.timer);
  const normalized: PermissionOptionId =
    optionId === "allow-once" || optionId === "allow-session" || optionId === "deny"
      ? optionId
      : "deny";
  p.resolve(normalized);
  return true;
}

function requestPermission(
  toolName: string,
  summary: string,
  verdict: PermissionVerdict,
  timeoutMs = 120_000,
): Promise<PermissionOptionId> {
  const id = nextRequestId + randomInt(1_000_000);
  nextRequestId += 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("permission request timed out"));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    send({
      jsonrpc: "2.0",
      id,
      method: "session/request_permission",
      params: {
        toolCall: { title: toolName, rawInput: summary },
        verdict: { risk: verdict.risk, reason: verdict.reason },
        options: [
          { id: "allow-once", label: "允许一次" },
          { id: "allow-session", label: "本会话允许" },
          { id: "deny", label: "拒绝" },
        ],
      },
    });
  });
}

export interface GateResult {
  allow: boolean;
  text?: string;
}

/**
 * Enforce permission policy for a tool call.
 * - deny-first rules still block outright
 * - requiresPrompt → ACP session/request_permission round-trip
 * - accept-edits / accept-all auto-allow per existing policy
 */
export async function gateToolCall(
  toolName: "Bash" | "Edit",
  input: string,
  permissionMode: PermissionMode,
  workspaceRoot?: string,
): Promise<GateResult> {
  // Workspace rules override built-in policy.
  if (workspaceRoot) {
    const file = loadPermissionsFile(workspaceRoot);
    const rule = matchPermissionRule(file, toolName, input);
    if (rule) {
      if (rule.action === "deny") {
        return {
          allow: false,
          text: `Blocked by workspace rule: ${rule.reason ?? rule.pattern}`,
        };
      }
      if (rule.action === "allow") {
        return { allow: true };
      }
      // ask → fall through to prompt
      try {
        const choice = await requestPermission(toolName, input, {
          allow: false,
          risk: "medium",
          reason: rule.reason ?? rule.pattern,
          requiresPrompt: true,
        });
        if (choice === "deny") {
          return { allow: false, text: `Denied by user: ${rule.reason ?? rule.pattern}` };
        }
        return { allow: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { allow: false, text: `Permission request failed: ${msg}` };
      }
    }
  }

  const verdict =
    toolName === "Bash"
      ? assessBash(input, permissionMode)
      : assessToolCall(toolName, input, permissionMode);

  if (!verdict.allow && !verdict.requiresPrompt) {
    return {
      allow: false,
      text: `Blocked by permission: ${verdict.reason}`,
    };
  }

  if (verdict.requiresPrompt) {
    try {
      const choice = await requestPermission(toolName, input, verdict);
      if (choice === "deny") {
        return { allow: false, text: `Denied by user: ${verdict.reason}` };
      }
      return { allow: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { allow: false, text: `Permission request failed: ${msg}` };
    }
  }

  return { allow: true };
}
