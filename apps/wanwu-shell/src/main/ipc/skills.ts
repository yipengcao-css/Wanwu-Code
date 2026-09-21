import { ipcMain } from "electron";
import { listWorkspaceSkills } from "./skillsList.js";

export { listWorkspaceSkills } from "./skillsList.js";

export function registerSkillsIpc(getRoot: () => string | null): void {
  ipcMain.handle("skills:list", () => {
    const root = getRoot();
    if (!root) return [];
    return listWorkspaceSkills(root);
  });
}
