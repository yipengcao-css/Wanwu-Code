import { ipcMain } from "electron";
import { gitStatus } from "../gitStatus.js";

export function registerGitIpc(getRoot: () => string | null): void {
  ipcMain.handle("git:status", () => {
    const root = getRoot();
    if (!root) return [];
    return gitStatus(root);
  });
}
