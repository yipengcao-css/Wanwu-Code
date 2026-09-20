import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import * as readline from "node:readline";
import { loadWanwuConfig } from "@wanwu/config";
import { discoverMemory } from "./memory.js";
import { discoverSkills } from "./skills.js";
import { runDeterministicTurn } from "./native/agentLoop.js";
import { runLlmAgentLoop, shouldUseLlm } from "./native/llmAgentLoop.js";
import { shouldStream } from "./native/stream.js";
import { MODE_CYCLE, detectMode, nextMode, stripModeTags } from "./native/mode.js";
import { runPlanAsync } from "./plan.js";
import { runVerifyWithReview } from "./verify.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";
import { runHooks } from "./hooks.js";
import { listWorkspaceFiles } from "./native/tools.js";
import { listSessions, loadSession, saveSession } from "./native/sessionStore.js";
import { renderDiff } from "./tui/renderDiff.js";
import { SessionLog } from "./tui/sessionLog.js";
import { parseSessionUpdate } from "./tui/sessionSink.js";
import { renderStatusBar } from "./tui/statusBar.js";
import { color, resolveTheme } from "./tui/theme.js";
import { ToolTimeline } from "./tui/toolTimeline.js";
import { composeFrame } from "./tui/layout.js";
import { createScreenWriter, redrawFrame } from "./tui/screen.js";
import { SessionView } from "./tui/sessionView.js";
import { parseSlashImage } from "./tui/imageCmd.js";
import { resolveAttachments } from "./media/resolveAttachment.js";

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
  /resume        列出/恢复磁盘上的会话（/resume 2 或 /resume <id>）
  /undo          回滚上一轮 Agent 的文件修改（检查点）
  /status        显示模式/provider/工作区/token 用量
  /mcp           列出已配置 MCP server
  /image [path]  附加图片（无参数列出；/image clear 清空）
  /clear         清屏
  /exit          退出

上下文引用（Tab 补全）：
  @文件/@目录    附带文件内容或目录列表
  @git:status|diff|log  附带 git 状态/差异/日志
  @web:关键词    联网搜索
  @codebase / @codebase:查询  语义搜索代码库
  @terminal / @diagnostics  终端输出 / 诊断（宿主支持时）

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

  let sessionId = `tui-${Date.now()}`;
  runHooks(cwd, "SessionStart", { sessionId, sessionSource: "new" });
  let history: Array<{ role: string; content: string }> = [];
  let lastUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;
  let pendingImages: string[] = [];
  const sessionLog = new SessionLog();
  const timeline = new ToolTimeline();
  const view = new SessionView(timeline);
  const screen = createScreenWriter();
  const usePanes = process.stdout.isTTY && process.env.WANWU_TUI_SIMPLE !== "1";

  print(BANNER);
  print(`Wanwu TUI · workspace=${cwd}`);
  print(`provider=${config.activeProvider}/${config.model} · permission=${config.permissionMode} · sandbox=${config.sandbox}`);
  print(
    `llm=${shouldUseLlm(config) ? "on" : "deterministic"} · stream=${shouldStream() ? "on" : "off"} · memory=${discoverMemory(cwd).length} · skills=${discoverSkills(cwd).length} · theme=${theme.name}`,
  );
  print(HELP);

  // @-mention path completion (workspace files + special mentions)
  const workspaceFiles = listWorkspaceFiles(cwd);
  const SPECIAL_MENTIONS = ["@git:status", "@git:diff", "@git:log", "@web:", "@codebase", "@terminal", "@diagnostics"];
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: promptLine(mode),
    completer: (line: string): [string[], string] => {
      const m = line.match(/@([\w./\\-]*)$/);
      if (!m) return [[], line];
      const partial = m[1] ?? "";
      const pathHits = workspaceFiles
        .filter((f) => f.startsWith(partial))
        .slice(0, 20)
        .map((f) => `@${f}`);
      const specialHits = SPECIAL_MENTIONS.filter((s) => s.startsWith(`@${partial}`));
      const hits = [...pathHits, ...specialHits];
      return [hits, `@${partial}`];
    },
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

  function statusState() {
    return {
      mode,
      provider: config.activeProvider,
      model: config.model,
      llm: shouldUseLlm(config),
      workspace: cwd,
      toolsRunning: 0,
      stream: shouldStream(),
      inputTokens: lastUsage?.inputTokens,
      outputTokens: lastUsage?.outputTokens,
      totalTokens: lastUsage?.totalTokens,
    };
  }

  function redraw(): void {
    if (!usePanes) return;
    const state = view.getState();
    const cols = process.stdout.columns ?? 80;
    const rows = process.stdout.rows ?? 24;
    const lines = composeFrame(
      state.chat,
      state.tools,
      state.status || renderStatusBar(statusState(), theme),
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
        print(renderStatusBar(statusState(), theme));
        rl.prompt();
        return;
      }
      if (input === "/resume" || input.startsWith("/resume ")) {
        const arg = input.slice(7).trim();
        const all = listSessions(cwd);
        if (!all.length) {
          print("（没有可恢复的会话）");
          rl.prompt();
          return;
        }
        if (!arg) {
          all.slice(0, 10).forEach((s, i) => {
            const last = s.history.filter((m) => m.role === "user").at(-1);
            const preview = typeof last?.content === "string" ? last.content.slice(0, 60) : "";
            print(`  ${i + 1}. ${s.id} · ${s.updatedAt.slice(0, 16)} · ${preview}`);
          });
          print("用法: /resume <序号|sessionId>");
          rl.prompt();
          return;
        }
        const target = /^\d+$/.test(arg) ? all[Number(arg) - 1] : all.find((s) => s.id === arg);
        if (!target) {
          print(`未找到会话: ${arg}`);
          rl.prompt();
          return;
        }
        const stored = loadSession(cwd, target.id);
        if (!stored) {
          print(`会话读取失败: ${target.id}`);
          rl.prompt();
          return;
        }
        sessionId = stored.id;
        history = stored.history as never;
        sessionLog.add({ mode, user: `(恢复会话 ${stored.id})`, tools: [] });
        print(`已恢复会话 ${stored.id}（${stored.history.length} 条消息）`);
        rl.prompt();
        return;
      }
      if (input === "/undo") {
        const { latestCheckpoint, restoreCheckpoint } = await import("./native/checkpoints.js");
        const meta = latestCheckpoint(cwd);
        if (!meta) {
          print("（没有可回滚的检查点）");
        } else {
          const r = restoreCheckpoint(cwd, meta.id);
          print(
            `已回滚 ${meta.id}：恢复 ${r.restored.length} 个文件，删除 ${r.deleted.length} 个新建文件` +
              (r.missing.length ? `，缺失 ${r.missing.length}` : ""),
          );
        }
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
      const imageCmd = parseSlashImage(input);
      if (imageCmd) {
        if (imageCmd.action === "list") {
          if (!pendingImages.length) print("（没有待发送的图片。用法: /image <path>）");
          else pendingImages.forEach((p, i) => print(`  ${i + 1}. ${p}`));
        } else if (imageCmd.action === "clear") {
          pendingImages = [];
          print("已清空待发送图片");
        } else {
          const abs = isAbsolute(imageCmd.path) ? imageCmd.path : join(cwd, imageCmd.path);
          if (!existsSync(abs)) {
            print(`找不到图片: ${abs}`);
          } else {
            pendingImages.push(abs);
            print(`已附加 ${abs}（共 ${pendingImages.length} 张，下一条消息发送）`);
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
      runHooks(cwd, "UserPromptSubmit", { sessionId, prompt: input, mode: effectiveMode });
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
              view.appendChat(event.text);
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
          const attachments = pendingImages.length ? resolveAttachments(pendingImages) : undefined;
          if (pendingImages.length) {
            print(`已随本轮发送 ${pendingImages.length} 张图片`);
            pendingImages = [];
          }
          const out = await runLlmAgentLoop(ctx, config, input, {
            history: history as never,
            attachments,
          });
          history = out.messages.filter((m) => m.role !== "system") as never;
          lastUsage = out.usage;
          saveSession({
            id: sessionId,
            workspaceRoot: cwd,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            history: history as never,
          });
          if (out.text && !shouldStream()) {
            assistantText += out.text;
            print(`\n${out.text}`);
          }
          if (out.usage) {
            print(
              `\x1b[90m· tokens: in ${out.usage.inputTokens} / out ${out.usage.outputTokens} · checkpoint ${out.checkpointId ?? "-"} · /undo 可回滚\x1b[0m`,
            );
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
    runHooks(cwd, "SessionEnd", { sessionId });
    print("\n再见。");
    process.exit(0);
  });

  return new Promise(() => {
    /* keep alive */
  });
}
