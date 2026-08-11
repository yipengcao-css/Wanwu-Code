import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWanwuConfig } from "@wanwu/config";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export interface AcpLaunchPlan {
  command: string;
  args: string[];
  backend: string;
  /** cwd for spawning the backend (may differ from workspace root). */
  spawnCwd?: string;
}

const here = dirname(fileURLToPath(import.meta.url));

function nativeServerEntry(): string {
  const ts = join(here, "native", "acpServer.ts");
  const js = join(here, "native", "acpServer.js");
  if (existsSync(ts)) return ts;
  return js;
}

/** Walk up from this package to the pnpm workspace root (for `pnpm exec tsx`). */
function findMonorepoRoot(): string {
  let dir = here;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Resolve which process backs `wanwu acp`.
 * Default: wanwu-native ACP (no grok required).
 * Override: WANWU_ACP_COMMAND="cmd arg1 arg2"
 */
export function resolveAcpLaunch(cwd: string = findWorkspaceRoot()): AcpLaunchPlan {
  const override = process.env.WANWU_ACP_COMMAND?.trim();
  if (override) {
    const parts = override.split(/\s+/);
    return { command: parts[0]!, args: parts.slice(1), backend: "env:WANWU_ACP_COMMAND" };
  }

  const { config } = loadWanwuConfig(cwd);
  if (config.acpBackend === "grok") {
    const grokArgs = (process.env.WANWU_GROK_ACP_ARGS ?? "acp").trim().split(/\s+/);
    return { command: "grok", args: grokArgs, backend: "grok-bridge" };
  }

  const entry = nativeServerEntry();
  const monorepo = findMonorepoRoot();
  // Prefer tsx when running from source; compiled dist uses node on .js
  if (entry.endsWith(".ts")) {
    return {
      command: "pnpm",
      args: ["exec", "tsx", entry],
      backend: "wanwu-native",
      spawnCwd: monorepo,
    };
  }
  return {
    command: process.execPath,
    args: [entry],
    backend: "wanwu-native",
    spawnCwd: monorepo,
  };
}

export function spawnAcpBridge(cwd: string = findWorkspaceRoot()): ChildProcessWithoutNullStreams {
  const plan = resolveAcpLaunch(cwd);
  return spawn(plan.command, plan.args, {
    cwd: plan.spawnCwd ?? cwd,
    env: {
      ...process.env,
      WANWU_ACP_BACKEND: plan.backend,
      WANWU_WORKSPACE_ROOT: cwd,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** Proxy current process stdio to the backend ACP agent (IDE integration entry). */
export async function runAcpProxy(cwd?: string): Promise<number> {
  const workspace =
    cwd ?? process.env.WANWU_WORKSPACE_ROOT?.trim() ?? findWorkspaceRoot();
  const plan = resolveAcpLaunch(workspace);
  console.error(`[wanwu acp] backend=${plan.backend} → ${plan.command} ${plan.args.join(" ")}`);

  return await new Promise<number>((resolve) => {
    const child = spawn(plan.command, plan.args, {
      cwd: plan.spawnCwd ?? workspace,
      env: {
        ...process.env,
        WANWU_ACP_BACKEND: plan.backend,
        WANWU_WORKSPACE_ROOT: workspace,
      },
      stdio: ["inherit", "inherit", "inherit"],
    });

    child.on("error", (err) => {
      console.error(`[wanwu acp] failed to start: ${err.message}`);
      console.error(
        "Hint: set acp_backend=wanwu-native (default), install grok for grok bridge, or set WANWU_ACP_COMMAND",
      );
      resolve(1);
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`[wanwu acp] killed by signal ${signal}`);
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}
