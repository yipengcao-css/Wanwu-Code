import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { loadWanwuConfig } from "@wanwu/config";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export interface AcpLaunchPlan {
  command: string;
  args: string[];
  backend: string;
}

/**
 * Resolve which process backs `wanwu acp`.
 * Default: bridge to Grok Build ACP (`grok` with ACP stdio entry).
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
    // Grok Build exposes ACP via agent stdio mode; WANWU_GROK_ACP_ARGS can override.
    const grokArgs = (process.env.WANWU_GROK_ACP_ARGS ?? "acp").trim().split(/\s+/);
    return { command: "grok", args: grokArgs, backend: "grok-bridge" };
  }

  return {
    command: process.execPath,
    args: ["-e", "console.error('wanwu-native ACP is not implemented yet'); process.exit(2)"],
    backend: "wanwu-native-stub",
  };
}

export function spawnAcpBridge(cwd: string = findWorkspaceRoot()): ChildProcessWithoutNullStreams {
  const plan = resolveAcpLaunch(cwd);
  const child = spawn(plan.command, plan.args, {
    cwd,
    env: {
      ...process.env,
      WANWU_ACP_BACKEND: plan.backend,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return child;
}

/** Proxy current process stdio to the backend ACP agent (IDE integration entry). */
export async function runAcpProxy(cwd: string = findWorkspaceRoot()): Promise<number> {
  const plan = resolveAcpLaunch(cwd);
  console.error(`[wanwu acp] backend=${plan.backend} → ${plan.command} ${plan.args.join(" ")}`);

  return await new Promise<number>((resolve) => {
    const child = spawn(plan.command, plan.args, {
      cwd,
      env: { ...process.env, WANWU_ACP_BACKEND: plan.backend },
      stdio: ["inherit", "inherit", "inherit"],
    });

    child.on("error", (err) => {
      console.error(`[wanwu acp] failed to start: ${err.message}`);
      console.error("Hint: install Grok Build (https://x.ai/cli) or set WANWU_ACP_COMMAND");
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