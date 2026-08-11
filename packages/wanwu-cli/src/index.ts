#!/usr/bin/env node
import { runAcpProxy } from "./acpBridge.js";
import { runCloudCommand } from "./cloudCmd.js";
import { printDoctor, runDoctor } from "./doctor.js";
import { runExec } from "./exec.js";
import { runHooks } from "./hooks.js";
import { runInspect } from "./inspect.js";
import { writebackMemory } from "./memoryWriteback.js";
import { runParallelCommand } from "./parallelCmd.js";
import { runPlan } from "./plan.js";
import { assessBash } from "./permission.js";
import { runVerify } from "./verify.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";

function usage(): never {
  console.log(`wanwu — Wanwu-Code CLI

Usage:
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
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      usage();
      break;
    case "doctor":
      return printDoctor(runDoctor());
    case "inspect":
      runInspect();
      return 0;
    case "acp":
      return await runAcpProxy();
    case "exec": {
      const prompt = readPrompt(rest);
      if (!prompt) {
        console.error("wanwu exec requires -p/--prompt");
        return 2;
      }
      return await runExec({ prompt });
    }
    case "plan": {
      const prompt = readPrompt(rest);
      if (!prompt) {
        console.error("wanwu plan requires -p/--prompt");
        return 2;
      }
      runPlan(prompt);
      return 0;
    }
    case "verify":
      return runVerify();
    case "memory-writeback": {
      const note = readPrompt(rest);
      if (!note) {
        console.error("wanwu memory-writeback requires -p/--prompt <note>");
        return 2;
      }
      writebackMemory({ note, yes: hasFlag(rest, "--yes") });
      return 0;
    }
    case "check-perm": {
      const prompt = readPrompt(rest);
      if (!prompt) {
        console.error("wanwu check-perm requires -p/--prompt <bash>");
        return 2;
      }
      const verdict = assessBash(prompt, "ask");
      console.log(JSON.stringify(verdict, null, 2));
      return verdict.allow ? 0 : 1;
    }
    case "hooks": {
      const event = (rest[0] ?? "PostToolUse") as "PreToolUse" | "PostToolUse" | "Stop";
      const result = runHooks(findWorkspaceRoot(), event);
      for (const line of result.outputs) console.log(line);
      return result.ok ? 0 : 1;
    }
    case "cloud":
      return await runCloudCommand(rest);
    case "parallel":
      return runParallelCommand(rest);
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