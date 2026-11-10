import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { resolveBundledAcpLaunch } from "@wanwu/acp-client";

export interface AcpProcessOptions {
  cwd: string;
  commandOverride?: string;
  workspaceRoot: string;
  /** Extension install dir — may contain bundled wanwu-cli/. */
  extensionPath?: string;
  /** Monorepo root when developing inside this repo. */
  repoRoot?: string;
  useMock?: boolean;
}

function findMonorepoRoot(start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function resolveExtensionAcpLaunch(opts: AcpProcessOptions): {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  spawnCwd: string;
  backend: string;
} {
  if (opts.commandOverride?.trim()) {
    const parts = opts.commandOverride.trim().split(/\s+/);
    return {
      command: parts[0]!,
      args: parts.slice(1),
      env: { ...process.env, WANWU_WORKSPACE_ROOT: opts.workspaceRoot },
      spawnCwd: opts.cwd,
      backend: "env:WANWU_ACP_COMMAND",
    };
  }

  const repoRoot = opts.repoRoot ?? findMonorepoRoot(opts.workspaceRoot);
  const searchRoots: string[] = [];
  if (opts.extensionPath) {
    searchRoots.push(path.join(opts.extensionPath, "wanwu-cli"));
  }

  if (opts.useMock || process.env.WANWU_ACP_MOCK === "1") {
    if (!repoRoot) {
      throw new Error("mock ACP 需要在 Wanwu-Code 仓库内运行");
    }
    const tsx = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const mockEntry = path.join(repoRoot, "packages/wanwu-cli/src/mockAcpServer.ts");
    return {
      command: process.execPath,
      args: [tsx, mockEntry],
      env: { ...process.env, WANWU_WORKSPACE_ROOT: opts.workspaceRoot },
      spawnCwd: repoRoot,
      backend: "mock-tsx",
    };
  }

  const plan = resolveBundledAcpLaunch({
    workspaceRoot: opts.workspaceRoot,
    execPath: process.execPath,
    searchRoots,
    repoRoot,
    env: process.env,
    electronAsNode: false,
  });
  return {
    command: plan.command,
    args: plan.args,
    env: { ...process.env, ...plan.env },
    spawnCwd: plan.spawnCwd,
    backend: plan.backend,
  };
}

export function startAcpProcess(opts: AcpProcessOptions): ChildProcessWithoutNullStreams {
  const plan = resolveExtensionAcpLaunch(opts);
  return spawn(plan.command, plan.args, {
    cwd: plan.spawnCwd,
    env: plan.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
