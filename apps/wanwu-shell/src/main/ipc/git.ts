import { ipcMain } from "electron";
import { gitCommit, gitDiff, gitScmStatus, gitStage } from "../gitOps.js";
import { gitStatus } from "../gitStatus.js";

export function registerGitIpc(getRoot: () => string | null): void {
  ipcMain.handle("git:status", () => {
    const root = getRoot();
    if (!root) return [];
    return gitStatus(root);
  });

  ipcMain.handle("git:changes", () => {
    const root = getRoot();
    if (!root) return { repo: false, files: [] };
    return gitScmStatus(root);
  });

  ipcMain.handle("git:diff", (_e, rel: string) => {
    const root = getRoot();
    if (!root) return "";
    return gitDiff(root, String(rel));
  });

  ipcMain.handle("git:stage", (_e, rels: string[], staged: boolean) => {
    const root = getRoot();
    if (!root) return { ok: false, text: "未打开工作区" };
    return gitStage(root, rels.map(String), Boolean(staged));
  });

  ipcMain.handle("git:commit", (_e, message: string) => {
    const root = getRoot();
    if (!root) return { ok: false, text: "未打开工作区" };
    return gitCommit(root, String(message));
  });
}
