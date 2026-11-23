import { ipcMain } from "electron";
import {
  gitBlameLine,
  gitBranch,
  gitCommit,
  gitDiff,
  gitDiscard,
  gitDiscardAll,
  gitFileLog,
  gitFileSides,
  gitPull,
  gitPush,
  gitScmStatus,
  gitStage,
  gitStageAll,
  gitStageHunk,
  gitUnstagedHunks,
} from "../gitOps.js";
import { gitStatus } from "../gitStatus.js";

export function registerGitIpc(getRoot: () => string | null): void {
  ipcMain.handle("git:status", () => {
    const root = getRoot();
    if (!root) return [];
    return gitStatus(root);
  });

  ipcMain.handle("git:changes", () => {
    const root = getRoot();
    if (!root) return { repo: false, branch: "", files: [] };
    return { ...gitScmStatus(root), branch: gitBranch(root) };
  });

  ipcMain.handle("git:log", (_e, rel: string) => {
    const root = getRoot();
    if (!root) return [];
    return gitFileLog(root, String(rel));
  });

  ipcMain.handle("git:blame", (_e, rel: string, line: number) => {
    const root = getRoot();
    if (!root) return { text: "" };
    return gitBlameLine(root, String(rel), Number(line));
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

  ipcMain.handle("git:discard", (_e, rel: string) => {
    const root = getRoot();
    if (!root) return { ok: false, text: "未打开工作区" };
    return gitDiscard(root, String(rel));
  });

  ipcMain.handle("git:sides", (_e, rel: string) => {
    const root = getRoot();
    if (!root) return { original: "", modified: "", untracked: false };
    return gitFileSides(root, String(rel));
  });

  ipcMain.handle("git:stageAll", () => {
    const root = getRoot();
    if (!root) return { ok: false, text: "未打开工作区" };
    return gitStageAll(root);
  });

  ipcMain.handle("git:discardAll", () => {
    const root = getRoot();
    if (!root) return { ok: false, text: "未打开工作区" };
    return gitDiscardAll(root);
  });

  ipcMain.handle("git:push", () => {
    const root = getRoot();
    if (!root) return { ok: false, text: "未打开工作区" };
    return gitPush(root);
  });

  ipcMain.handle("git:pull", () => {
    const root = getRoot();
    if (!root) return { ok: false, text: "未打开工作区" };
    return gitPull(root);
  });

  ipcMain.handle("git:hunks", (_e, rel: string) => {
    const root = getRoot();
    if (!root) return { hunks: [], note: "" };
    return gitUnstagedHunks(root, String(rel));
  });

  ipcMain.handle("git:stageHunk", (_e, rel: string, index: number) => {
    const root = getRoot();
    if (!root) return { ok: false, text: "未打开工作区" };
    return gitStageHunk(root, String(rel), Number(index));
  });
}
