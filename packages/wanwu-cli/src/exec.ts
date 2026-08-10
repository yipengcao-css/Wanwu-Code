import { spawnSync } from "node:child_process";
import { loadWanwuConfig } from "@wanwu/config";
import { discoverMemory, renderMemoryForPrompt } from "./memory.js";
import { resolveAcpLaunch } from "./acpBridge.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export interface ExecOptions {
  prompt: string;
  cwd?: string;
}

/**
 * Headless one-shot execution.
 * MVP: if grok is available, call `grok` headless with prompt; otherwise print a dry-run plan.
 */
export function runExec(options: ExecOptions): number {
  const cwd = options.cwd ?? findWorkspaceRoot();
  const { config } = loadWanwuConfig(cwd);
  const memory = discoverMemory(cwd);
  const memoryBlock = renderMemoryForPrompt(memory);
  const composed = [
    memoryBlock ? `${memoryBlock}\n\n` : "",
    `User request:\n${options.prompt}`,
    `\n[wanwu mode hints] permissionMode=${config.permissionMode} sandbox=${config.sandbox}`,
    `\n[provider] ${config.activeProvider} / ${config.model}`,
  ].join("");

  const plan = resolveAcpLaunch(cwd);
  if (plan.backend === "grok-bridge") {
    // Prefer grok headless if present; fall back to dry-run on failure.
    const headlessArgs = (process.env.WANWU_GROK_EXEC_ARGS ?? `exec --prompt`).trim().split(/\s+/);
    const result = spawnSync(plan.command, [...headlessArgs, composed], {
      cwd,
      encoding: "utf8",
      env: process.env,
    });
    if (result.error) {
      printDryRun(composed, config.activeProvider, config.model, result.error.message);
      return 0;
    }
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return result.status ?? 1;
  }

  printDryRun(composed, config.activeProvider, config.model);
  return 0;
}

function printDryRun(
  composed: string,
  provider: string,
  model: string,
  reason?: string,
): void {
  console.log(
    JSON.stringify(
      {
        status: "dry-run",
        provider,
        model,
        reason,
        message:
          "No native headless backend executed. Install grok or set WANWU_ACP_COMMAND for live runs.",
        promptPreview: composed.slice(0, 2000),
      },
      null,
      2,
    ),
  );
}