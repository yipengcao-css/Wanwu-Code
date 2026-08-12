#!/usr/bin/env node
import { findWorkspaceRoot } from "./workspaceRoot.js";

function usage(): never {
  console.log(`wanwu — Wanwu-Code CLI

Usage:
  wanwu                     Start interactive TUI (default when no command)
  wanwu tui                 Start interactive TUI
  wanwu doctor              Check config, providers, grok ACP bridge, memory
  wanwu inspect             Print merged config + memory/skills/hooks/mcp (JSON)
  wanwu acp                 Start ACP server (bridges to Grok Build by default)
  wanwu exec -p|--prompt    Headless one-shot prompt
  wanwu plan -p|--prompt    Write a Plan artifact under .wanwu/plans/
  wanwu verify              Run isolated typecheck/test/lint gate
  wanwu memory-writeback -p|--prompt <note> [--yes]
  wanwu check-perm -p|--prompt <bash>   Deny-first permission probe
  wanwu hooks <event>       Run hooks (PreToolUse|PostToolUse|Stop)
  wanwu cloud ...           Headless cloud runner (local/docker, review-first)
  wanwu parallel ...        Parallel worktree isolation demo
  wanwu plugin ...          Plugin marketplace (skills / MCP)
  wanwu mcp-config ...      Interactive MCP server configuration
  wanwu help                Show this help

Env:
  WANWU_ACP_COMMAND         Override ACP backend command line
  WANWU_GROK_ACP_ARGS       Args for grok ACP (default: "acp")
  WANWU_GROK_EXEC_ARGS      Args prefix for grok exec (default: "exec --prompt")
  WANWU_PROVIDER            Override active provider (openai|anthropic|xai|ollama|custom)
  WANWU_MODEL               Override model id
  OPENAI_BASE_URL           OpenAI-compatible API base (e.g. https://api.deepseek.com)
  WANWU_FORCE_DETERMINISTIC=1  Disable LLM; use native heuristic loop
`);
  process.exit(0);
}

function readPrompt(rest: string[]): string {
  let prompt = "";
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "-p" || a === "--prompt") {
      prompt = rest[i + 1] ?? "";
      i += 1;
    } else if (a?.startsWith("--prompt=")) {
      prompt = a.slice("--prompt=".length);
    } else if (!prompt && a && !a.startsWith("--")) {
      prompt = a;
    }
  }
  return prompt;
}

function hasFlag(rest: string[], name: string): boolean {
  return rest.includes(name);
}

async function main(argv: string[]): Promise<number> {
  while (argv[0] === "--") {
    argv = argv.slice(1);
  }

  // Packaged / self-reexec entry for wanwu-native ACP stdio server
  if (argv.includes("--wanwu-internal-acp") || process.env.WANWU_INTERNAL_ACP === "1") {
    const { startNativeAcpStdioServer } = await import("./native/acpServer.js");
    startNativeAcpStdioServer();
    await new Promise<void>(() => {
      /* keep alive for readline */
    });
    return 0;
  }

  const [cmd, ...rest] = argv;

  switch (cmd) {
    case undefined:
      // No subcommand: launch TUI when attached to a terminal, else help.
      if (process.stdin.isTTY && process.stdout.isTTY) {
        const { runTui } = await import("./tui.js");
        return await runTui();
      }
      usage();
      break;
    case "tui": {
      const { runTui } = await import("./tui.js");
      return await runTui();
    }
    case "help":
    case "-h":
    case "--help":
      usage();
      break;
    case "doctor": {
      const { printDoctor, runDoctor } = await import("./doctor.js");
      return printDoctor(runDoctor());
    }
    case "inspect": {
      const { runInspect } = await import("./inspect.js");
      runInspect();
      return 0;
    }
    case "acp": {
      const { runAcpProxy } = await import("./acpBridge.js");
      return await runAcpProxy();
    }
    case "exec": {
      const prompt = readPrompt(rest);
      if (!prompt) {
        console.error("wanwu exec requires -p/--prompt");
        return 2;
      }
      const { runExec } = await import("./exec.js");
      return await runExec({ prompt });
    }
    case "plan": {
      const prompt = readPrompt(rest);
      if (!prompt) {
        console.error("wanwu plan requires -p/--prompt");
        return 2;
      }
      const { runPlan } = await import("./plan.js");
      runPlan(prompt);
      return 0;
    }
    case "verify": {
      const { runVerify } = await import("./verify.js");
      return runVerify();
    }
    case "memory-writeback": {
      const note = readPrompt(rest);
      if (!note) {
        console.error("wanwu memory-writeback requires -p/--prompt <note>");
        return 2;
      }
      const { writebackMemory } = await import("./memoryWriteback.js");
      writebackMemory({ note, yes: hasFlag(rest, "--yes") });
      return 0;
    }
    case "check-perm": {
      const prompt = readPrompt(rest);
      if (!prompt) {
        console.error("wanwu check-perm requires -p/--prompt <bash>");
        return 2;
      }
      const { assessBash } = await import("./permission.js");
      const verdict = assessBash(prompt, "ask");
      console.log(JSON.stringify(verdict, null, 2));
      return verdict.allow ? 0 : 1;
    }
    case "hooks": {
      const event = (rest[0] ?? "PostToolUse") as "PreToolUse" | "PostToolUse" | "Stop";
      const { runHooks } = await import("./hooks.js");
      const result = runHooks(findWorkspaceRoot(), event);
      for (const line of result.outputs) console.log(line);
      return result.ok ? 0 : 1;
    }
    case "cloud": {
      const { runCloudCommand } = await import("./cloudCmd.js");
      return await runCloudCommand(rest);
    }
    case "parallel": {
      const { runParallelCommand } = await import("./parallelCmd.js");
      return runParallelCommand(rest);
    }
    case "plugin": {
      const { runPluginCommand } = await import("./plugin/cmd.js");
      return await runPluginCommand(rest);
    }
    case "mcp-config": {
      const { runMcpConfigCommand } = await import("./mcp/configCmd.js");
      return await runMcpConfigCommand(rest);
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
