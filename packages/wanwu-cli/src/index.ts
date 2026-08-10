#!/usr/bin/env node
import { runAcpProxy } from "./acpBridge.js";
import { printDoctor, runDoctor } from "./doctor.js";
import { runExec } from "./exec.js";
import { runInspect } from "./inspect.js";
import { runPlan } from "./plan.js";
import { runVerify } from "./verify.js";

function usage(): never {
  console.log(`wanwu — Wanwu-Code CLI

Usage:
  wanwu doctor              Check config, providers, grok ACP bridge, memory
  wanwu inspect             Print merged config + discovered memory (JSON)
  wanwu acp                 Start ACP server (bridges to Grok Build by default)
  wanwu exec -p|--prompt    Headless one-shot prompt
  wanwu plan -p|--prompt    Write a Plan artifact under .wanwu/plans/
  wanwu verify              Run isolated typecheck/test/lint gate
  wanwu help                Show this help

Env:
  WANWU_ACP_COMMAND         Override ACP backend command line
  WANWU_GROK_ACP_ARGS       Args for grok ACP (default: "acp")
  WANWU_GROK_EXEC_ARGS      Args prefix for grok exec (default: "exec --prompt")
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
    } else if (!prompt) {
      prompt = a ?? "";
    }
  }
  return prompt;
}

async function main(argv: string[]): Promise<number> {
  // pnpm/npm often forward a leading "--" before subcommands
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
    case "doctor": {
      return printDoctor(runDoctor());
    }
    case "inspect": {
      runInspect();
      return 0;
    }
    case "acp": {
      return await runAcpProxy();
    }
    case "exec": {
      const prompt = readPrompt(rest);
      if (!prompt) {
        console.error("wanwu exec requires -p/--prompt");
        return 2;
      }
      return runExec({ prompt });
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
    case "verify": {
      return runVerify();
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