import { ipcMain } from "electron";
import { loadUserCredentials, loadWanwuConfig } from "@wanwu/config";
import { completeChat, completeInline, sanitizeCompletion } from "@wanwu/providers";

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

  ipcMain.handle("ai:inlineEdit", async (_e, req: InlineEditRequest) => {
    try {
      const cwd = getRoot() ?? process.cwd();
      const { config } = loadWanwuConfig(cwd);
      const env = { ...process.env, ...loadUserCredentials() };
      const r = await completeChat({
        config,
        env,
        request: {
          temperature: 0.1,
          maxTokens: 2048,
          messages: [
            {
              role: "system",
              content:
                "You are an inline code editor. Rewrite the SELECTED code per the instruction. Output ONLY the replacement code for the selection — no explanation, no markdown fences. Preserve indentation style. If the instruction is unclear, return the selection unchanged.",
            },
            {
              role: "user",
              content: [
                req.path ? `File: ${req.path}` : "",
                req.language ? `Language: ${req.language}` : "",
                req.before ? `Context before:\n${req.before}` : "",
                `<selection>\n${req.selection}\n</selection>`,
                req.after ? `Context after:\n${req.after}` : "",
                `Instruction: ${req.instruction}`,
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
        },
      });
      return { text: sanitizeCompletion(r.text), model: r.model };
    } catch (err) {
      return { text: "", error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
    }
  });
}

export interface InlineEditRequest {
  instruction: string;
  selection: string;
  language?: string;
  path?: string;
  before?: string;
  after?: string;
}
