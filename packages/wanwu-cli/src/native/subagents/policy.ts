import type { SubagentKind, SubagentToolPolicy } from "./types.js";

const READONLY_BASH =
  /^(\s)*(ls|pwd|cat|head|tail|rg|grep|find|echo|node -v|pnpm -v|git status|git diff|git log)\b/i;

export function policyFor(kind: SubagentKind): SubagentToolPolicy {
  switch (kind) {
    case "explore":
      return {
        allowedTools: new Set(["Read", "Glob", "Grep", "Bash"]),
        mode: "ask",
        maxTurns: 4,
      };
    case "plan":
      return {
        allowedTools: new Set(["Read", "Glob", "Grep"]),
        mode: "plan",
        maxTurns: 4,
      };
    case "coder":
      return {
        allowedTools: new Set(["Read", "Glob", "Grep", "Edit", "Bash"]),
        mode: "agent",
        maxTurns: 6,
      };
  }
}

export function isToolAllowed(kind: SubagentKind, toolName: string): boolean {
  return policyFor(kind).allowedTools.has(toolName);
}

export function isBashAllowedForKind(kind: SubagentKind, command: string): boolean {
  if (kind === "coder") return true;
  return READONLY_BASH.test(command);
}
