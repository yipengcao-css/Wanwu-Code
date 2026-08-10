import * as vscode from "vscode";
import { WanwuChatPanel } from "./ui/chatPanel";
import { askToolPermission } from "./ui/permissionModal";
import { reviewSingleFileDiff } from "./ui/diffReview";
import { findExtensionWorkspaceRoot } from "./workspaceRoot";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("wanwu.newChat", () => {
      WanwuChatPanel.show(context);
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
      WanwuChatPanel.show(context);
      await vscode.window.showInformationMessage(
        "已打开 Wanwu Chat。请将 Mode 设为 Verify 后发送验证请求。",
      );
    }),
  );
}

export function deactivate(): void {
  WanwuChatPanel.current?.dispose();
}