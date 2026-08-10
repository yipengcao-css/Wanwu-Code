import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("wanwu.newChat", async () => {
      await vscode.window.showInformationMessage(
        "Wanwu Chat 面板将在 Phase 3 接入 ACP。当前为扩展骨架。",
      );
    }),
    vscode.commands.registerCommand("wanwu.doctor", async () => {
      const summary = [
        "activeProvider=(see ~/.wanwu/config.toml)",
        "acpBackend=grok (default bridge)",
        "permissionMode=ask (default)",
        "CLI `wanwu doctor` 尚未实现；请参阅 docs/ROADMAP.md",
      ].join(" | ");
      await vscode.window.showInformationMessage(summary);
    }),
    vscode.commands.registerCommand("wanwu.planTask", async () => {
      await vscode.window.showInformationMessage("Plan 模式将在 Phase 3/4 实现。");
    }),
    vscode.commands.registerCommand("wanwu.runVerify", async () => {
      await vscode.window.showInformationMessage("Verify 模式将在 Phase 3/4 实现。");
    }),
  );
}

export function deactivate(): void {
  // no-op
}