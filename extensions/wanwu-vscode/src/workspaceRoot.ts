import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";

export function findExtensionWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (folder) {
    return walkUp(folder);
  }
  return walkUp(process.cwd());
}

function walkUp(start: string): string {
  let dir = start;
  for (;;) {
    if (
      existsSync(join(dir, "pnpm-workspace.yaml")) ||
      existsSync(join(dir, "WANWU.md")) ||
      existsSync(join(dir, ".git"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}