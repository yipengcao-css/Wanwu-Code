import * as vscode from "vscode";
import { existsSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { diffReviewTitle, languageForPath, resolveEditAbsPath } from "./diffPaths";

export interface PendingDiff {
  path: string;
  before: string;
  after: string;
}

/**
 * Side-by-side vscode.diff review. Accept writes via WorkspaceEdit.
 */
export async function reviewSingleFileDiff(
  diff: PendingDiff,
  workspaceRoot?: string,
): Promise<"accept" | "reject"> {
  const lang = languageForPath(diff.path);
  const beforeDoc = await vscode.workspace.openTextDocument({
    content: diff.before,
    language: lang,
  });
  const afterDoc = await vscode.workspace.openTextDocument({
    content: diff.after,
    language: lang,
  });
  await vscode.commands.executeCommand(
    "vscode.diff",
    beforeDoc.uri,
    afterDoc.uri,
    diffReviewTitle(diff.path),
  );
  const choice = await vscode.window.showInformationMessage(
    `接受对 ${diff.path} 的修改？`,
    { modal: true },
    "Accept",
    "Reject",
  );
  if (choice !== "Accept") return "reject";

  const root =
    workspaceRoot ??
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
    process.cwd();
  const abs = resolveEditAbsPath(root, diff.path);
  mkdirSync(path.dirname(abs), { recursive: true });
  const uri = vscode.Uri.file(abs);
  const edit = new vscode.WorkspaceEdit();
  if (!existsSync(abs)) {
    edit.createFile(uri, { ignoreIfExists: true });
  }
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const last = doc.lineAt(Math.max(0, doc.lineCount - 1));
    edit.replace(uri, new vscode.Range(new vscode.Position(0, 0), last.range.end), diff.after);
  } catch {
    edit.insert(uri, new vscode.Position(0, 0), diff.after);
  }
  const ok = await vscode.workspace.applyEdit(edit);
  if (!ok) {
    throw new Error(`WorkspaceEdit 未能写入 ${diff.path}`);
  }
  const saved = await vscode.workspace.openTextDocument(uri);
  await saved.save();
  return "accept";
}
