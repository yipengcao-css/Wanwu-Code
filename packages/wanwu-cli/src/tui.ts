import * as readline from "node:readline";
import { loadWanwuConfig } from "@wanwu/config";
import { discoverMemory } from "./memory.js";
import { discoverSkills } from "./skills.js";
import { runDeterministicTurn } from "./native/agentLoop.js";
import { runLlmAgentLoop, shouldUseLlm } from "./native/llmAgentLoop.js";
import { MODE_CYCLE, detectMode, nextMode, stripModeTags } from "./native/mode.js";
import { runPlanAsync } from "./plan.js";
import { runVerifyWithReview } from "./verify.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";
import { renderDiff } from "./tui/renderDiff.js";
import { SessionLog } from "./tui/sessionLog.js";
import { parseSessionUpdate } from "./tui/sessionSink.js";
import { renderStatusBar } from "./tui/statusBar.js";
import { color, resolveTheme } from "./tui/theme.js";
import { ToolTimeline } from "./tui/toolTimeline.js";
import { composeFrame } from "./tui/layout.js";
import { createScreenWriter, redrawFrame } from "./tui/screen.js";
import { SessionView } from "./tui/sessionView.js";

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
  /ask /plan /agent /verify      快速切换模式
  /plan <task>   生成 Plan 工件
  /verify        运行 Verify 门禁 + 独立评审
  /doctor        运行 doctor
  /inspect       打印配置/记忆/skills/mcp
  /history [n]   显示最近 n 轮会话
  /clear         清屏
  /exit          退出

快捷键：
  Ctrl+T         循环切换模式（ask → plan → agent → verify）

直接输入自然语言即可与 Agent 对话。
`;

function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

export async function runTui(): Promise<number> {
  const cwd = findWorkspaceRoot();
  const { config } = loadWanwuConfig(cwd);
  const theme = resolveTheme();
  let mode = config.defaultMode;

  function promptLine(current: string): string {
    return `\n${color(theme, "prompt", "wanwu")} [${color(theme, "mode", current)}] ${color(theme, "accent", "❯")} `;
  }

  const sessionId = `tui-${Date.now()}`;
  let history: Array<{ role: string; content: string }> = [];
  const sessionLog = new SessionLog();
  const timeline = new ToolTimeline();
  const view = new SessionView(timeline);
  const screen = createScreenWriter();
  const usePanes = process.stdout.isTTY && process.env.WANWU_TUI_SIMPLE !== "1";

  print(BANNER);
  print(`Wanwu TUI · workspace=${cwd}`);
  print(`provider=${config.activeProvider}/${config.model} · permission=${config.permissionMode} · sandbox=${config.sandbox}`);
  print(`llm=${shouldUseLlm(config) ? "on" : "deterministic"} · memory=${discoverMemory(cwd).length} · skills=${discoverSkills(cwd).length} · theme=${theme.name}`);
  print(HELP);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: promptLine(mode),
  });

  // Ctrl+T cycles mode
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("keypress", (_str: string, key: { ctrl?: boolean; name?: string }) => {
    if (key?.ctrl && key.name === "t") {
      mode = nextMode(mode);
      print(`\nmode → ${mode}`);
      rl.setPrompt(promptLine(mode));
      rl.prompt();
    }
  });

  function redraw(): void {
    if (!usePanes) return;
    const state = view.getState();
    const cols = process.stdout.columns ?? 80;
    const rows = process.stdout.rows ?? 24;
    const lines = composeFrame(
      state.chat,
      state.tools,
      state.status || renderStatusBar(
        {
          mode,
          provider: config.activeProvider,
          model: config.model,
          llm: shouldUseLlm(config),
          workspace: cwd,
          toolsRunning: 0,
        },
        theme,
      ),
      promptLine(mode),
      { cols, rows, rightRatio: cols >= 100 ? 0.3 : 0 },
    );
    redrawFrame(screen, lines);
  }

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
      if (input === "/redraw") {
        redraw();
        rl.prompt();
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
        if (MODE_CYCLE.includes(next as never)) {
          mode = next as typeof mode;
          print(`mode → ${mode}`);
        } else {
          print(`未知 mode: ${next}`);
        }
        rl.prompt();
        return;
      }
      if (["/ask", "/plan", "/agent", "/verify"].includes(input)) {
        mode = input.slice(1) as typeof mode;
        print(`mode → ${mode}`);
        rl.prompt();
        return;
      }
      if (input === "/status") {
        print(
          renderStatusBar(
            {
              mode,
              provider: config.activeProvider,
              model: config.model,
              llm: shouldUseLlm(config),
              workspace: cwd,
              toolsRunning: 0,
            },
            theme,
          ),
        );
        rl.prompt();
        return;
      }
      if (input === "/mcp") {
        const { loadMcpServers } = await import("./mcp/loadConfig.js");
        const { servers, source } = loadMcpServers(cwd);
        print(`MCP source: ${source ?? "(none)"}`);
        for (const s of servers) {
          print(`  ${s.name}: ${s.command} ${s.args.join(" ")}`);
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
      if (input.startsWith("/history")) {
        const n = Number(input.split(/\s+/)[1] ?? "10") || 10;
        const turns = sessionLog.list(n);
        if (!turns.length) {
          print("（暂无历史）");
        } else {
          for (const t of turns) {
            print(`\x1b[90m#${t.id} [${t.mode}] ${t.ts}\x1b[0m`);
            print(`  user: ${t.user.slice(0, 120)}`);
            if (t.assistant) print(`  assistant: ${t.assistant.slice(0, 120)}`);
            if (t.tools.length) {
              print(`  tools: ${t.tools.map((x) => `${x.title}(${x.status})`).join(", ")}`);
            }
          }
        }
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

      timeline.clear();
      const turnTools: Array<{ title: string; status: string }> = [];
      let assistantText = "";

      // Intercept stdout to pretty-print ACP session updates
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        for (const raw of s.split("\n")) {
          if (!raw.trim()) continue;
          const event = parseSessionUpdate(raw);
          if (event) {
            if (event.type === "tool") {
              const line = timeline.upsert(event.toolCallId, event.title, event.status);
              view.addChat(line);
              turnTools.push({ title: event.title, status: event.status });
            } else if (event.type === "diff") {
              view.addChat(renderDiff(event.path, event.before, event.after));
            } else if (event.type === "text") {
              assistantText += event.text;
              view.addChat(event.text);
            }
            if (usePanes) redraw();
            continue;
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
          if (out.text) {
            assistantText += out.text;
            print(`\n${out.text}`);
          }
        } else {
          runDeterministicTurn(ctx, stripModeTags(input));
        }
        sessionLog.add({
          mode: effectiveMode,
          user: input,
          assistant: assistantText || undefined,
          tools: turnTools,
        });
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
