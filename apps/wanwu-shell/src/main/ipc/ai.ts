import { ipcMain } from "electron";
import { loadUserCredentials, loadWanwuConfig } from "@wanwu/config";
import { completeInline } from "@wanwu/providers";

export interface InlineCompleteRequest {
  prefix: string;
  suffix: string;
  language?: string;
  path?: string;
}

/** Inline completion (Tab ghost text) via the active provider. */
export function registerAiIpc(getRoot: () => string | null): void {
  ipcMain.handle("ai:complete", async (_e, req: InlineCompleteRequest) => {
    if (process.env.WANWU_TAB_COMPLETE === "0") return { text: "" };
    try {
      const cwd = getRoot() ?? process.cwd();
      const { config } = loadWanwuConfig(cwd);
      const env = { ...process.env, ...loadUserCredentials() };
      const r = await completeInline({
        config,
        prefix: String(req?.prefix ?? "").slice(-3000),
        suffix: String(req?.suffix ?? "").slice(0, 800),
        language: req?.language,
        filePath: req?.path,
        env,
      });
      return { text: r.text, model: r.model };
    } catch (err) {
      // Completion must never break typing — degrade to silence.
      return { text: "", error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
    }
  });
}
