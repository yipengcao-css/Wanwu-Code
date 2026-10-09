import { ipcMain } from "electron";
import { deleteMemory, deleteRule, listMemories, listRules, writeRule } from "../library.js";

export function registerLibraryIpc(getRoot: () => string | null): void {
  ipcMain.handle("library:list", () => {
    const root = getRoot();
    if (!root) return { rules: [], memories: [] };
    return { rules: listRules(root), memories: listMemories(root) };
  });

  ipcMain.handle(
    "library:writeRule",
    (_e, payload: { name?: string; body?: string; scope?: "user" | "workspace" }) => {
      const root = getRoot();
      if (!root) throw new Error("未打开工作区");
      const scope = payload.scope === "user" ? "user" : "workspace";
      writeRule(root, String(payload.name ?? ""), String(payload.body ?? ""), scope);
      return { ok: true };
    },
  );

  ipcMain.handle("library:deleteRule", (_e, name: string, scope: "user" | "workspace") => {
    const root = getRoot();
    if (!root) return { ok: false };
    return { ok: deleteRule(root, String(name), scope === "user" ? "user" : "workspace") };
  });

  ipcMain.handle("library:deleteMemory", (_e, index: number) => {
    const root = getRoot();
    if (!root) return { ok: false };
    return { ok: deleteMemory(root, Number(index)) };
  });
}
