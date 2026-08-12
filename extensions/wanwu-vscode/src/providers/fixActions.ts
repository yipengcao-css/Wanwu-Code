import * as vscode from "vscode";

export class WanwuFixActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      const action = new vscode.CodeAction(
        `用 Wanwu 修复：${diagnostic.message.slice(0, 60)}`,
        vscode.CodeActionKind.QuickFix,
      );
      action.command = {
        command: "wanwu.fixWithProblem",
        title: "用 Wanwu 修复",
        arguments: [document.uri, diagnostic],
      };
      action.diagnostics = [diagnostic];
      actions.push(action);
    }
    return actions;
  }
}
