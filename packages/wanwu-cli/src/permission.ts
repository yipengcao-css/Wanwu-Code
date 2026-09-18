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

/** Split a command line into its shell segments (best-effort, for scoping guards). */
function shellSegments(cmd: string): string[] {
  // Separators: newline, ;, &&, ||, | and a lone background & — but NOT an & that
  // is part of a redirection such as 2>&1, >&2 or &> (those are not separators).
  return cmd
    .split(/\n|;|&&|\|\||\||(?<![\d>&])&(?![>&])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Does this segment invoke `rm` with a recursive flag (any order / long form)? */
function isRecursiveRm(seg: string): boolean {
  if (!/(^|\s)rm(\s|$)/i.test(seg)) return false;
  // short flags containing r (e.g. -r, -rf, -fr, -Rf) or long --recursive
  return /(^|\s)-[a-z]*r[a-z]*(\s|$)/i.test(seg) || /(^|\s)--recursive(\s|=|$)/i.test(seg);
}

/** Recursive rm aimed at filesystem root or a home directory → catastrophic. */
function isRootOrHomeRm(seg: string): boolean {
  if (!isRecursiveRm(seg)) return false;
  if (/--no-preserve-root/i.test(seg)) return true;
  return (
    /(^|\s)\/(\s|$)/.test(seg) || // bare "/"
    /(^|\s)\/\*/.test(seg) || // "/*"
    /(^|\s)~(\/|\s|$)/.test(seg) || // "~" or "~/..."
    /(^|\s)\$HOME(\/|\s|$)/i.test(seg) // "$HOME..."
  );
}

export function assessBash(command: string, mode: PermissionMode = "ask"): PermissionVerdict {
  const cmd = command.trim();
  const segments = shellSegments(cmd);

  // Catastrophic recursive rm on root/home is always denied, regardless of mode.
  for (const seg of segments) {
    if (isRootOrHomeRm(seg)) {
      return {
        allow: false,
        risk: "high",
        reason: "destructive recursive rm on root/home path",
        requiresPrompt: false,
      };
    }
  }

  for (const p of DENY_PATTERNS) {
    if (p.re.test(cmd)) {
      return { allow: false, risk: "high", reason: p.reason, requiresPrompt: false };
    }
  }

  // Any recursive rm (flag order / long form independent) is high-risk.
  for (const seg of segments) {
    if (isRecursiveRm(seg)) {
      if (mode === "accept-all") {
        return { allow: true, risk: "high", reason: "recursive delete", requiresPrompt: false };
      }
      return { allow: false, risk: "high", reason: "recursive delete", requiresPrompt: true };
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

/**
 * Commands considered read-only. Used to enforce the read-only contract of
 * plan/ask/verify modes: those modes must not mutate the workspace, so Bash is
 * restricted to this allowlist (Edit is already blocked separately).
 */
const READ_ONLY_COMMANDS = new Set([
  "ls",
  "pwd",
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "echo",
  "printf",
  "wc",
  "stat",
  "file",
  "find",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "sort",
  "uniq",
  "cut",
  "tr",
  "tac",
  "nl",
  "fold",
  "column",
  "diff",
  "cmp",
  "jq",
  "xxd",
  "od",
  "date",
  "whoami",
  "hostname",
  "uname",
  "env",
  "printenv",
  "which",
  "type",
  "tree",
  "du",
  "df",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "true",
  "false",
]);

/** Read-only git subcommands (no working-tree / ref mutations). */
const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  "status",
  "log",
  "diff",
  "show",
  "ls-files",
  "ls-tree",
  "rev-parse",
  "rev-list",
  "describe",
  "blame",
  "shortlog",
  "reflog",
  "cat-file",
  "name-rev",
  "grep",
  "whatchanged",
  "for-each-ref",
  "symbolic-ref",
]);

function isReadOnlySegment(seg: string): boolean {
  const trimmed = seg.trim();
  if (!trimmed) return true;

  // Reject file-writing redirection (> file, >> file, 1> file) while allowing
  // fd duplication such as 2>&1 or >&2.
  if (/>\s*[^&\s]/.test(trimmed) || /\d*>>/.test(trimmed)) return false;
  // Reject command substitution which could hide mutating commands.
  if (/\$\(/.test(trimmed) || /`/.test(trimmed)) return false;

  const tokens = trimmed.split(/\s+/);
  const cmd = tokens[0] ?? "";

  // Strip a leading `env` invocation used only for VAR=val passthrough.
  if (cmd === "env" && tokens.length === 1) return true;

  // Inline VAR=val assignments (e.g. NODE_ENV=test cmd) are mutations to env only
  // when followed by a command; require that command to be read-only too.
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(cmd)) return false;

  if (cmd === "git") {
    const sub = tokens[1] ?? "";
    if (!READ_ONLY_GIT_SUBCOMMANDS.has(sub)) return false;
    // `git branch`/`git tag`/`git stash` list forms only (reject mutating flags).
    return true;
  }

  // Version probes for package managers / runtimes are read-only.
  if (["node", "npm", "pnpm", "yarn", "deno", "bun"].includes(cmd)) {
    return tokens.slice(1).every((t) => /^(-v|--version|version)$/.test(t));
  }

  // `sed` mutates in place only with -i; without it, it streams to stdout.
  if (cmd === "sed") {
    return !tokens.some((t) => t === "-i" || t.startsWith("-i") || t === "--in-place");
  }

  return READ_ONLY_COMMANDS.has(cmd);
}

/**
 * True when every segment of a shell command line is read-only (no workspace
 * mutation). Conservative by design: unknown commands are treated as mutating.
 */
export function isReadOnlyBash(command: string): boolean {
  const segments = shellSegments(command);
  if (!segments.length) return true;
  return segments.every(isReadOnlySegment);
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