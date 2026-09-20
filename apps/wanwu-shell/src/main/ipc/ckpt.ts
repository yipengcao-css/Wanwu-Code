import { ipcMain } from "electron";
import { latestCheckpoint, listCheckpoints, restoreCheckpoint } from "../checkpoints.js";

export function registerCkptIpc(getRoot: () => string | null): void {
  ipcMain.handle("ckpt:list", () => {
    const root = getRoot();
    if (!root) return [];
    return listCheckpoints(root).map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      files: m.files.length,
    }));
  });

  ipcMain.handle("ckpt:restore", (_e, id?: string) => {
    const root = getRoot();
    if (!root) throw new Error("no workspace open");
    const target = id?.trim() || latestCheckpoint(root)?.id;
    if (!target) throw new Error("没有可撤销的检查点");
    return { id: target, ...restoreCheckpoint(root, target) };
  });
}
