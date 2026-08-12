import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import type { SandboxMode } from "@wanwu/config";
import { detectSandboxBackend } from "./detect.js";
import { resolveSandboxPolicy } from "./policy.js";

export interface SandboxRunOptions {
  workspaceRoot: string;
  command: string;
  mode: SandboxMode;
  env: NodeJS.ProcessEnv;
  timeout?: number;
}

export interface SandboxRunResult {
  status: number;
  stdout: string;
  stderr: string;
  error?: string;
}

function runRaw(opts: SandboxRunOptions): SandboxRunResult {
  const result = spawnSync(opts.command, {
    cwd: opts.workspaceRoot,
    encoding: "utf8",
    shell: true,
    timeout: opts.timeout ?? 60_000,
    env: opts.env,
  }) as SpawnSyncReturns<string>;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message,
  };
}

function runBwrap(opts: SandboxRunOptions): SandboxRunResult {
  const args: string[] = [
    "--die-with-parent",
    "--new-session",
    "--bind",
    opts.workspaceRoot,
    opts.workspaceRoot,
    "--chdir",
    opts.workspaceRoot,
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
  ];
  if (opts.mode === "strict") {
    args.push("--unshare-net");
  }
  args.push("--", "bash", "-lc", opts.command);

  const result = spawnSync("bwrap", args, {
    cwd: opts.workspaceRoot,
    encoding: "utf8",
    timeout: opts.timeout ?? 60_000,
    env: opts.env,
  }) as SpawnSyncReturns<string>;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message,
  };
}

function runSeatbelt(opts: SandboxRunOptions): SandboxRunResult {
  const profile = `
(version 1)
(deny default)
(allow process* )
(allow file-read* (subpath "/"))
(allow file-write* (subpath "${opts.workspaceRoot}") (subpath "/tmp") (subpath "/private/tmp"))
${opts.mode === "strict" ? "(deny network*)" : "(allow network*)"}
`;
  const args = ["-p", profile, "bash", "-lc", opts.command];
  const result = spawnSync("sandbox-exec", args, {
    cwd: opts.workspaceRoot,
    encoding: "utf8",
    timeout: opts.timeout ?? 60_000,
    env: opts.env,
  }) as SpawnSyncReturns<string>;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message,
  };
}

function runDocker(opts: SandboxRunOptions): SandboxRunResult {
  const args = [
    "run",
    "--rm",
    "--network",
    opts.mode === "strict" ? "none" : "bridge",
    "-v",
    `${opts.workspaceRoot}:/workspace`,
    "-w",
    "/workspace",
    "node:22-alpine",
    "sh",
    "-c",
    opts.command,
  ];
  const result = spawnSync("docker", args, {
    cwd: opts.workspaceRoot,
    encoding: "utf8",
    timeout: opts.timeout ?? 120_000,
    env: opts.env,
  }) as SpawnSyncReturns<string>;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message,
  };
}

/**
 * Run a shell command under the configured OS sandbox.
 * Falls back to raw spawn only when mode=off or no backend and mode=workspace.
 */
export function runSandboxed(opts: SandboxRunOptions): SandboxRunResult {
  const backend = detectSandboxBackend();
  const policy = resolveSandboxPolicy(opts.mode, backend);

  if (!policy.enforce) {
    if (opts.mode === "strict") {
      return {
        status: 1,
        stdout: "",
        stderr: "",
        error: policy.reason ?? "sandbox strict unavailable",
      };
    }
    return runRaw(opts);
  }

  switch (backend) {
    case "bwrap":
      return runBwrap(opts);
    case "sandbox-exec":
      return runSeatbelt(opts);
    case "docker":
      return runDocker(opts);
    default:
      return runRaw(opts);
  }
}
