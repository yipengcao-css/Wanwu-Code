import { spawnSync } from "node:child_process";
import { loadWanwuConfig } from "@wanwu/config";
import { ProviderError } from "@wanwu/providers";
import { discoverMemory, renderMemoryForPrompt } from "./memory.js";
import { resolveAcpLaunch } from "./acpBridge.js";
import { runDeterministicTurn } from "./native/agentLoop.js";
import { runLlmTurn, shouldUseLlm } from "./native/llmTurn.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export interface ExecOptions {
  prompt: string;
  cwd?: string;
}

/**
 * Headless one-shot execution.
 * With BYOK credentials → LLM turn via @wanwu/providers.
 * Else wanwu-native deterministic tool loop.
 */
export async function runExec(options: ExecOptions): Promise<number> {
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

  if (plan.backend === "wanwu-native" || plan.backend.startsWith("env:")) {
    const sessionId = "exec-session";
    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      for (const line of s.split("\n")) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as {
            method?: string;
            params?: { update?: { content?: { text?: string }; title?: string } };
          };
          if (msg.method === "session/update") {
            const text = msg.params?.update?.content?.text;
            const title = msg.params?.update?.title;
            if (title) chunks.push(`[tool:${title}]`);
            if (text) chunks.push(text);
            return true;
          }
        } catch {
          /* not jsonrpc */
        }
      }
      return true;
    }) as typeof process.stdout.write;

    const ctx = {
      workspaceRoot: cwd,
      sessionId,
      permissionMode: config.permissionMode,
      mode: config.defaultMode,
    };

    let llm = false;
    let provider = (process.env.WANWU_PROVIDER?.trim() || config.activeProvider) as typeof config.activeProvider;
    let model = process.env.WANWU_MODEL?.trim() || config.model;
    try {
      if (shouldUseLlm(config)) {
        llm = true;
        const out = await runLlmTurn(ctx, config, options.prompt);
        provider = out.provider as typeof provider;
        model = out.model;
      } else {
        runDeterministicTurn(ctx, options.prompt);
      }
    } catch (err) {
      process.stdout.write = origWrite;
      if (err instanceof ProviderError) {
        console.log(
          JSON.stringify(
            {
              status: "error",
              llm: true,
              provider: err.provider,
              code: err.code,
              message: err.message,
              hint: err.hint,
            },
            null,
            2,
          ),
        );
        return 1;
      }
      throw err;
    } finally {
      process.stdout.write = origWrite;
    }

    console.log(
      JSON.stringify(
        {
          status: "ok",
          backend: plan.backend,
          llm,
          provider,
          model,
          output: chunks.join("\n").slice(0, 8000),
        },
        null,
        2,
      ),
    );
    return 0;
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
          "No native headless backend executed. Set acp_backend=wanwu-native or install grok.",
        promptPreview: composed.slice(0, 2000),
      },
      null,
      2,
    ),
  );
}
