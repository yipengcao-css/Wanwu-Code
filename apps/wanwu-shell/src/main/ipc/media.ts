import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInsideRoot } from "../pathSandbox.js";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "paste.png";
}

export function registerMediaIpc(getRoot: () => string | null): void {
  ipcMain.handle(
    "media:saveImage",
    async (_e, payload: { name?: string; mime?: string; dataBase64: string }) => {
      const root = getRoot();
      if (!root) throw new Error("no workspace open");
      if (!payload?.dataBase64) throw new Error("dataBase64 required");
      const ext = EXT_BY_MIME[(payload.mime ?? "").toLowerCase()] ?? ".png";
      let name = safeName(payload.name ?? `paste${ext}`);
      if (!/\.(png|jpe?g|webp|gif)$/i.test(name)) name += ext;
      const rel = `.wanwu/attachments/${Date.now()}-${name}`;
      const abs = resolveInsideRoot(root, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, Buffer.from(payload.dataBase64, "base64"));
      return rel;
    },
  );

  ipcMain.handle("media:pickImages", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });
}
