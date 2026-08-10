import * as vscode from "vscode";

export interface PendingDiff {
  path: string;
  before: string;
  after: string;
}

/**
 * Minimal diff review: open a disposable doc with proposed content and ask accept/reject.
 * Full multi-file review UI comes later.
 */
export async function reviewSingleFileDiff(diff: PendingDiff): Promise<"accept" | "reject"> {
  const doc = await vscode.workspace.openTextDocument({
    content: `--- proposed change for ${diff.path} ---\n\n${diff.after}`,
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  const choice = await vscode.window.showInformationMessage(
    `接受对 ${diff.path} 的修改？`,
    { modal: true },
    "Accept",
    "Reject",
  );
  return choice === "Accept" ? "accept" : "reject";
}