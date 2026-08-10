import type { PermissionMode } from "@wanwu/config";

export type Risk = "low" | "medium" | "high";

export interface PermissionVerdict {
  allow: boolean;
  risk: Risk;
  reason: string;
  requiresPrompt: boolean;
}

const DENY_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /rm\s+-rf\s+\/(?!\s|$)/i, reason: "destructive rm -rf on filesystem root-like path" },
  { re: /rm\s+-rf\s+~\/\.ssh/i, reason: "refuses to delete ~/.ssh" },
  { re: /cat\s+~\/\.ssh\//i, reason: "refuses to read private SSH keys" },
  { re: /cat\s+\/etc\/shadow/i, reason: "refuses to read /etc/shadow" },
  { re: /curl\s+[^\n]*\|\s*(ba)?sh/i, reason: "pipe-to-shell download blocked" },
  { re: /wget\s+[^\n]*\|\s*(ba)?sh/i, reason: "pipe-to-shell download blocked" },
  { re: /git\s+push\s+[^\n]*--force/i, reason: "force push requires explicit high-trust mode" },
  { re: /dd\s+if=/i, reason: "raw disk dd blocked" },
];

const HIGH_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /rm\s+-rf\b/i, reason: "recursive delete" },
  { re: /sudo\b/i, reason: "privilege escalation" },
  { re: /chmod\s+-R\s+777\b/i, reason: "world-writable chmod" },
  { re: /kubectl\s+delete\b/i, reason: "cluster delete" },
];

const MEDIUM_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(npm|pnpm|yarn)\s+publish\b/i, reason: "package publish" },
  { re: /\bgit\s+push\b/i, reason: "remote push" },
  { re: /\bcurl\b|\bwget\b/i, reason: "network egress" },
];

export function assessBash(command: string, mode: PermissionMode = "ask"): PermissionVerdict {
  const cmd = command.trim();
  for (const p of DENY_PATTERNS) {
    if (p.re.test(cmd)) {
      return { allow: false, risk: "high", reason: p.reason, requiresPrompt: false };
    }
  }
  for (const p of HIGH_PATTERNS) {
    if (p.re.test(cmd)) {
      if (mode === "accept-all") {
        return { allow: true, risk: "high", reason: p.reason, requiresPrompt: false };
      }
      return { allow: false, risk: "high", reason: p.reason, requiresPrompt: true };
    }
  }
  for (const p of MEDIUM_PATTERNS) {
    if (p.re.test(cmd)) {
      if (mode === "accept-all" || mode === "accept-edits") {
        return { allow: true, risk: "medium", reason: p.reason, requiresPrompt: false };
      }
      return { allow: false, risk: "medium", reason: p.reason, requiresPrompt: true };
    }
  }
  return { allow: true, risk: "low", reason: "default allow", requiresPrompt: false };
}

export function assessToolCall(
  toolName: string,
  input: string,
  mode: PermissionMode = "ask",
): PermissionVerdict {
  const name = toolName.toLowerCase();
  if (name === "bash" || name === "shell" || name === "execute") {
    return assessBash(input, mode);
  }
  if (name === "read" && /\/\.ssh\//.test(input)) {
    return {
      allow: false,
      risk: "high",
      reason: "refuses to read paths under .ssh",
      requiresPrompt: false,
    };
  }
  if (name === "write" || name === "edit") {
    if (mode === "ask") {
      return {
        allow: false,
        risk: "medium",
        reason: "file mutation requires confirmation in ask mode",
        requiresPrompt: true,
      };
    }
    return { allow: true, risk: "medium", reason: "edits accepted by mode", requiresPrompt: false };
  }
  return { allow: true, risk: "low", reason: "tool default allow", requiresPrompt: false };
}