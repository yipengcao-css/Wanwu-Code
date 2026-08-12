import * as readline from "node:readline";
import { loadWanwuConfig } from "@wanwu/config";
import { discoverMemory } from "./memory.js";
import { discoverSkills } from "./skills.js";
import { runDeterministicTurn } from "./native/agentLoop.js";
import { runLlmAgentLoop, shouldUseLlm } from "./native/llmAgentLoop.js";
import { detectMode, stripModeTags } from "./native/mode.js";
import { runPlanAsync } from "./plan.js";
import { runVerifyWithReview } from "./verify.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";

const BANNER = `
██╗    ██╗ █████╗ ███╗   ██╗██╗    ██╗██╗   ██╗
██║    ██║██╔══██╗████╗  ██║██║    ██║██║   ██║
██║ █╗ ██║███████║██╔██╗ ██║██║ █╗ ██║██║   ██║
██║███╗██║██╔══██║██║╚██╗██║██║███╗██║██║   ██║
╚███╔███╔╝██║  ██║██║ ╚████║╚███╔███╔╝╚██████╔╝
 ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚══╝╚══╝  ╚═════╝
`;

const HELP = `命令：
  /help          显示帮助
  /mode <ask|plan|agent|verify>  切换模式
  /plan <task>   生成 Plan 工件
  /verify        运行 Verify 门禁 + 独立评审
  /doctor        运行 doctor
  /inspect       打印配置/记忆/skills/mcp
  /clear         清屏
  /exit          退出

直接输入自然语言即可与 Agent 对话。
`;

function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

function promptLine(mode: string): string {
  return `\n\x1b[36mwanwu\x1b[0m [\x1b[33m${mode}\x1b[0m] \x1b[32m❯\x1b[0m `;
}

export async function runTui(): Promise<number> {
  const cwd = findWorkspaceRoot();
  const { config } = loadWanwuConfig(cwd);
  let mode = config.defaultMode;
  const sessionId = `tui-${Date.now()}`;
  let history: Array<{ role: string; content: string }> = [];

  print(BANNER);
  print(`Wanwu TUI · workspace=${cwd}`);
  print(`provider=${config.activeProvider}/${config.model} · permission=${config.permissionMode} · sandbox=${config.sandbox}`);
  print(`llm=${shouldUseLlm(config) ? "on" : "deterministic"} · memory=${discoverMemory(cwd).length} · skills=${discoverSkills(cwd).length}`);
  print(HELP);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: promptLine(mode),
  });

  rl.prompt();

  rl.on("line", (line) => {
    void (async () => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      if (input === "/exit" || input === "/quit") {
        rl.close();
        return;
      }
      if (input === "/help") {
        print(HELP);
        rl.prompt();
        return;
      }
      if (input === "/clear") {
        console.clear();
        rl.prompt();
        return;
      }
      if (input.startsWith("/mode ")) {
        const next = input.slice(6).trim();
        if (["ask", "plan", "agent", "verify"].includes(next)) {
          mode = next as typeof mode;
          print(`mode → ${mode}`);
        } else {
          print(`未知 mode: ${next}`);
        }
        rl.prompt();
        return;
      }
      if (input === "/doctor") {
        const { runDoctor, printDoctor } = await import("./doctor.js");
        printDoctor(runDoctor());
        rl.prompt();
        return;
      }
      if (input === "/inspect") {
        const { runInspect } = await import("./inspect.js");
        runInspect(cwd);
        rl.prompt();
        return;
      }
      if (input.startsWith("/plan ")) {
        const task = input.slice(6).trim();
        if (!task) {
          print("用法: /plan <task>");
          rl.prompt();
          return;
        }
        const path = await runPlanAsync(task, cwd);
        print(`已写入 Plan：${path}`);
        rl.prompt();
        return;
      }
      if (input === "/verify") {
        print("运行 Verify…");
        const result = await runVerifyWithReview(cwd, { quiet: true });
        print(result.code === 0 ? "Verify 通过。" : `Verify 失败（exit=${result.code}）`);
        if (result.review) print(`\n评审：\n${result.review}`);
        rl.prompt();
        return;
      }

      const effectiveMode = detectMode(input, mode);
      const ctx = {
        workspaceRoot: cwd,
        sessionId,
        permissionMode: config.permissionMode,
        mode,
      };

      // Intercept stdout to pretty-print ACP session updates
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        for (const raw of s.split("\n")) {
          if (!raw.trim()) continue;
          try {
            const msg = JSON.parse(raw) as {
              method?: string;
              params?: {
                update?: {
                  sessionUpdate?: string;
                  content?: { type?: string; text?: string };
                  title?: string;
                  status?: string;
                };
              };
            };
            if (msg.method === "session/update") {
              const u = msg.params?.update;
              if (u?.sessionUpdate === "tool_call") {
                print(`\x1b[90m[tool:${u.title}] ${u.status}\x1b[0m`);
              } else if (u?.content?.text) {
                print(u.content.text);
              }
              continue;
            }
          } catch {
            /* not json */
          }
          origWrite(raw);
        }
        return true;
      }) as typeof process.stdout.write;

      try {
        if (shouldUseLlm(config) && effectiveMode !== "verify") {
          const out = await runLlmAgentLoop(ctx, config, input, {
            history: history as never,
          });
          history = out.messages.filter((m) => m.role !== "system") as never;
          if (out.text) print(`\n${out.text}`);
        } else {
          runDeterministicTurn(ctx, stripModeTags(input));
        }
      } catch (err) {
        print(`\x1b[31mError: ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
      } finally {
        process.stdout.write = origWrite;
      }

      rl.setPrompt(promptLine(mode));
      rl.prompt();
    })();
  });

  rl.on("close", () => {
    print("\n再见。");
    process.exit(0);
  });

  return new Promise(() => {
    /* keep alive */
  });
}
