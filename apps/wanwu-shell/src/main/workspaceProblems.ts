import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseCheckerOutput, type ProblemDiag } from "../shared/problems.js";

export type WorkspaceScan = {
  available: boolean;
  label?: string;
  problems: ProblemDiag[];
  note: string;
};

type Checker = { command: string; args: string[]; label: string };

function has(cwd: string, rel: string): boolean {
  return existsSync(join(cwd, rel));
}

/** Same project signals as the CLI Diagnose tool, kept local so the shell does not import the CLI. */
export function detectWorkspaceChecker(cwd: string): Checker | null {
  if (has(cwd, "tsconfig.json")) {
    const localBin = join(cwd, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
    if (existsSync(localBin)) return { command: localBin, args: ["--noEmit", "--pretty", "false"], label: "tsc --noEmit" };
    if (has(cwd, "pnpm-lock.yaml") || has(cwd, "pnpm-workspace.yaml")) {
      return { command: "pnpm", args: ["exec", "tsc", "--noEmit", "--pretty", "false"], label: "tsc --noEmit" };
    }
    return { command: "npx", args: ["--no-install", "tsc", "--noEmit", "--pretty", "false"], label: "tsc --noEmit" };
  }
  if (has(cwd, "Cargo.toml")) {
    return { command: "cargo", args: ["check", "--message-format", "short"], label: "cargo check" };
  }
  if (has(cwd, "go.mod")) {
    return { command: "go", args: ["vet", "./..."], label: "go vet" };
  }
  if (has(cwd, "pyproject.toml") || has(cwd, "requirements.txt") || has(cwd, "setup.py")) {
    return { command: "python", args: ["-m", "compileall", "-q", "."], label: "python compileall" };
  }
  return null;
}

export function scanWorkspaceProblems(cwd: string, opts?: { timeoutMs?: number }): WorkspaceScan {
  const step = detectWorkspaceChecker(cwd);
  if (!step) return { available: false, problems: [], note: "" };
  const res = spawnSync(step.command, step.args, {
    cwd,
    timeout: opts?.timeoutMs ?? 25_000,
    maxBuffer: 2 * 1024 * 1024,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
    shell: process.platform === "win32",
    windowsHide: true,
  });
  const raw = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const timedOut = Boolean(res.error && /ETIMEDOUT|timed out/i.test(res.error.message));
  if (res.error && !timedOut) {
    return { available: true, label: step.label, problems: [], note: "检查器没有运行起来。" };
  }
  const problems = parseCheckerOutput(raw, cwd).slice(0, 300);
  let note = "";
  if (timedOut) note = "工作区扫描超时，列表可能不完整。";
  else if ((res.status ?? 1) !== 0 && problems.length === 0 && raw.trim()) {
    note = "检查器有输出，但没有带文件行号的位置。";
  }
  return { available: true, label: step.label, problems, note };
}
