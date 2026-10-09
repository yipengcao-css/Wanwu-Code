import { ipcMain } from "electron";
import { scanWorkspaceProblems } from "../workspaceProblems.js";

export function registerProblemsIpc(getRoot: () => string | null): void {
  ipcMain.handle("problems:scan", () => {
    const root = getRoot();
    if (!root) return { available: false, problems: [], note: "" };
    return scanWorkspaceProblems(root);
  });
}
