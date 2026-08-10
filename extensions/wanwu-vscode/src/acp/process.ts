import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as path from "node:path";

export interface AcpProcessOptions {
  cwd: string;
  commandOverride?: string;
  workspaceRoot: string;
  useMock?: boolean;
}

export function startAcpProcess(opts: AcpProcessOptions): ChildProcessWithoutNullStreams {
  if (opts.commandOverride?.trim()) {
    const parts = opts.commandOverride.trim().split(/\s+/);
    return spawn(parts[0]!, parts.slice(1), {
      cwd: opts.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  if (opts.useMock || process.env.WANWU_ACP_MOCK === "1") {
    const mockEntry = path.join(
      opts.workspaceRoot,
      "packages/wanwu-cli/src/mockAcpServer.ts",
    );
    return spawn("pnpm", ["exec", "tsx", mockEntry], {
      cwd: opts.workspaceRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  const cliEntry = path.join(opts.workspaceRoot, "packages/wanwu-cli/src/index.ts");
  return spawn("pnpm", ["exec", "tsx", cliEntry, "acp"], {
    cwd: opts.workspaceRoot,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
}