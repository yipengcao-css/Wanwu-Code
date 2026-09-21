import * as vscode from "vscode";
import { loadExtensionConfig } from "./config/loadConfig";
import { WanwuChatPanel } from "./ui/chatPanel";
import { WanwuSidebarProvider } from "./ui/sidebarView";
import { SessionManager } from "./ui/sessionManager";
import { askToolPermission } from "./ui/permissionModal";
import { reviewSingleFileDiff } from "./ui/diffReview";
import { WanwuFixActionProvider } from "./providers/fixActions";
import { findExtensionWorkspaceRoot } from "./workspaceRoot";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      WanwuSidebarProvider.viewId,
      new WanwuSidebarProvider(context),
    ),
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new WanwuFixActionProvider(),
      { providedCodeActionKinds: WanwuFixActionProvider.providedCodeActionKinds },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("wanwu.newChat", () => {
      WanwuChatPanel.show(context);
    }),
    vscode.commands.registerCommand("wanwu.cancel", async () => {
      await WanwuChatPanel.current?.cancel();
    }),
    vscode.commands.registerCommand("wanwu.resumeSession", async () => {
      const panel = WanwuChatPanel.current ?? WanwuChatPanel.show(context);
      await panel.resumeFromDisk();
    }),
    vscode.commands.registerCommand("wanwu.newParallelSession", () => {
      WanwuChatPanel.show(context, { forceNew: true });
    }),
    vscode.commands.registerCommand("wanwu.listSessions", async () => {
      await SessionManager.pickAndReveal();
    }),
    vscode.commands.registerCommand("wanwu.requestPermissionDemo", async () => {
      const decision = await askToolPermission("Bash", "rm -rf /tmp/wanwu-demo");
      await vscode.window.showInformationMessage(`Permission decision: ${decision}`);
    }),
    vscode.commands.registerCommand("wanwu.reviewDiffDemo", async () => {
      const result = await reviewSingleFileDiff({
        path: "examples/failing-test-demo/src/sum.js",
        before: "return a - b;",
        after: "export function sum(a, b) {\n  return a + b;\n}\n",
      });
      await vscode.window.showInformationMessage(`Diff review: ${result}`);
    }),
    vscode.commands.registerCommand("wanwu.doctor", async () => {
      const root = findExtensionWorkspaceRoot();
      try {
        const cfg = loadExtensionConfig() as {
          config?: { activeProvider?: string; acpBackend?: string; permissionMode?: string };
        };
        await vscode.window.showInformationMessage(
          `Wanwu config: provider=${cfg.config?.activeProvider} acp=${cfg.config?.acpBackend} perm=${cfg.config?.permissionMode}`,
        );
      } catch {
        // fall through to terminal doctor
      }
      const term = vscode.window.createTerminal({
        name: "wanwu doctor",
        cwd: root,
      });
      term.show();
      term.sendText("pnpm wanwu doctor");
    }),
    vscode.commands.registerCommand("wanwu.planTask", async () => {
      WanwuChatPanel.show(context);
      await vscode.window.showInformationMessage(
        "已打开 Wanwu Chat。请将 Mode 设为 Plan 后发送任务。",
      );
    }),
    vscode.commands.registerCommand("wanwu.runVerify", async () => {
      const root = findExtensionWorkspaceRoot();
      const term = vscode.window.createTerminal({ name: "wanwu verify", cwd: root });
      term.show();
      term.sendText("pnpm wanwu verify");
      WanwuChatPanel.show(context);
      await vscode.window.showInformationMessage(
        "已启动 `wanwu verify`，并打开 Chat（可将 Mode 设为 Verify）。",
      );
    }),
    vscode.commands.registerCommand(
      "wanwu.fixWithProblem",
      async (uri: vscode.Uri, diagnostic: vscode.Diagnostic) => {
        const panel = WanwuChatPanel.show(context);
        const prompt = [
          `修复这个诊断问题：`,
          ``,
          `文件：${uri.fsPath}`,
          `位置：第 ${diagnostic.range.start.line + 1} 行`,
          `严重级：${vscode.DiagnosticSeverity[diagnostic.severity]}`,
          `消息：${diagnostic.message}`,
          diagnostic.source ? `来源：${diagnostic.source}` : "",
          ``,
          `请先 Read 文件理解上下文，再用 Edit 做最小修复。`,
        ]
          .filter(Boolean)
          .join("\n");
        await panel.sendPrefilled(prompt, "agent");
      },
    ),
  );
}

export function deactivate(): void {
  SessionManager.disposeAll();
}