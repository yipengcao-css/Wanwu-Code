import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import path from "node:path";
import type { SandboxMode } from "@wanwu/config";

export interface PathJailOptions {
  workspaceRoot: string;
  command: string;
  mode: SandboxMode;
  env: NodeJS.ProcessEnv;
  timeout?: number;
}

export interface PathJailResult {
  status: number;
  stdout: string;
  stderr: string;
  error?: string;
}

function inside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Absolute paths, home shortcuts, and `..` that leave the workspace. */
export function outsideWorkspacePaths(command: string, workspaceRoot: string): string[] {
  const root = path.resolve(workspaceRoot);
  const tokens = command.split(/[\s"'`;|&<>()]+/);
  const found: string[] = [];
  for (const token of tokens) {
    if (!token || token.startsWith("-")) continue;
    const looksAbs =
      token === "~" ||
      token.startsWith("~/") ||
      token.startsWith("~\\") ||
      token.startsWith("\\\\") ||
      token.startsWith("/") ||
      /^[A-Za-z]:[\\/]/.test(token);
    const hasParent = token.split(/[\\/]/).includes("..");
    if (!looksAbs && !hasParent) continue;
    if (token.startsWith("~")) {
      found.push(token);
      continue;
    }
    if ((/^[A-Za-z]:[\\/]/.test(token) || token.startsWith("\\\\")) && process.platform !== "win32") {
      found.push(token);
      continue;
    }
    const resolved = path.resolve(root, token);
    if (!inside(root, resolved)) found.push(token);
  }
  return found;
}

/**
 * Workspace confinement when the OS has no bwrap, Seatbelt, or Docker.
 * This is the Windows path, and the fallback on other systems.
 * Strict mode does not use this: it still fails closed so network stays blocked.
 */
export function runPathJail(opts: PathJailOptions): PathJailResult {
  const outside = outsideWorkspacePaths(opts.command, opts.workspaceRoot);
  if (outside.length) {
    const text = `sandbox: refused path outside workspace: ${outside[0]}`;
    return { status: 1, stdout: "", stderr: text, error: text };
  }
  const result = spawnSync(opts.command, {
    cwd: opts.workspaceRoot,
    encoding: "utf8",
    shell: true,
    timeout: opts.timeout ?? 60_000,
    env: opts.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }) as SpawnSyncReturns<string>;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message,
  };
}
