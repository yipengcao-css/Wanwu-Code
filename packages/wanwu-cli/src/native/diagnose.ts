import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolResult } from "./tools.js";

const TIMEOUT_MS = 90_000;
const OUT_CLIP = 8000;

export interface DiagnoseStep {
  command: string;
  args: string[];
  label: string;
}

/**
 * Fast static check per project type (the "typecheck" tier of Verify).
 * Returns undefined when no known checker applies.
 */
export function detectDiagnoseStep(cwd: string): DiagnoseStep | undefined {
  const has = (p: string) => existsSync(join(cwd, p));

  if (has("tsconfig.json")) {
    // Prefer the project's own tsc — never let npx fetch a random package.
    const localBin = join(
      cwd,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tsc.cmd" : "tsc",
    );
    if (existsSync(localBin)) {
      return { command: localBin, args: ["--noEmit"], label: "tsc --noEmit" };
    }
    if (has("pnpm-lock.yaml") || has("pnpm-workspace.yaml")) {
      return { command: "pnpm", args: ["exec", "tsc", "--noEmit"], label: "tsc --noEmit" };
    }
    return { command: "npx", args: ["--no-install", "tsc", "--noEmit"], label: "tsc --noEmit" };
  }
  if (has("Cargo.toml")) {
    return { command: "cargo", args: ["check", "--message-format", "short"], label: "cargo check" };
  }
  if (has("go.mod")) {
    return { command: "go", args: ["vet", "./..."], label: "go vet" };
  }
  if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) {
    return {
      command: "python",
      args: ["-m", "compileall", "-q", "."],
      label: "python compileall",
    };
  }
  return undefined;
}

export interface DiagnoseResult {
  available: boolean;
  ok: boolean;
  label?: string;
  output: string;
  durationMs: number;
}

export function runDiagnose(cwd: string, opts?: { timeoutMs?: number }): DiagnoseResult {
  const step = detectDiagnoseStep(cwd);
  if (!step) {
    return { available: false, ok: true, output: "(no known checker for this project type)", durationMs: 0 };
  }
  const started = Date.now();
  const res = spawnSync(step.command, step.args, {
    cwd,
    timeout: opts?.timeoutMs ?? TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, CI: "1" },
    shell: process.platform === "win32",
  });
  const durationMs = Date.now() - started;
  const raw = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  const output = raw.length > OUT_CLIP ? `${raw.slice(0, OUT_CLIP)}\n…(truncated)` : raw;
  if (res.error) {
    return {
      available: true,
      ok: false,
      label: step.label,
      output: `checker failed to run: ${res.error.message}\n${output}`,
      durationMs,
    };
  }
  return {
    available: true,
    ok: res.status === 0,
    label: step.label,
    output: output || "(clean)",
    durationMs,
  };
}

export function toolDiagnose(workspaceRoot: string): ToolResult {
  const r = runDiagnose(workspaceRoot);
  if (!r.available) {
    return { ok: true, title: "Diagnose", text: r.output };
  }
  return {
    ok: r.ok,
    title: "Diagnose",
    text: `[${r.label} · ${r.durationMs}ms]\n${r.output}`,
  };
}
