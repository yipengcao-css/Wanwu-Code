import { BrowserWindow, dialog, ipcMain } from "electron";
import { loadUserCredentials, loadWanwuConfig } from "@wanwu/config";
import { completeChat, sanitizeCompletion } from "@wanwu/providers";
import {
  readMarkdownFile,
  saveSkillFile,
  SKILL_DRAFT_SYSTEM,
  unwrapSkillMarkdown,
} from "./skillFiles.js";
import { listWorkspaceSkills } from "./skillsList.js";

export { listWorkspaceSkills } from "./skillsList.js";

export function registerSkillsIpc(getRoot: () => string | null): void {
  ipcMain.handle("skills:list", () => listWorkspaceSkills(getRoot()));

  ipcMain.handle("skills:pickMarkdown", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      title: "选择 Skill Markdown",
      properties: ["openFile"],
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    const picked = result.filePaths[0];
    if (result.canceled || !picked) return null;
    return readMarkdownFile(picked);
  });

  ipcMain.handle("skills:readMarkdown", (_e, absPath: string) => {
    if (typeof absPath !== "string" || !absPath.trim()) return null;
    return readMarkdownFile(absPath);
  });

  ipcMain.handle(
    "skills:save",
    (_e, req: { dest?: "workspace" | "user"; name?: string; body?: string }) => {
      const dest = req?.dest === "user" ? "user" : "workspace";
      return saveSkillFile({
        dest,
        root: getRoot(),
        name: String(req?.name ?? ""),
        body: String(req?.body ?? ""),
      });
    },
  );

  ipcMain.handle("skills:draft", async (_e, req: { brief?: string; name?: string }) => {
    const brief = String(req?.brief ?? "").trim();
    if (!brief) return { markdown: "", error: "先写清楚这个 Skill 要让 Agent 遵守什么" };
    try {
      const cwd = getRoot() ?? process.cwd();
      const { config } = loadWanwuConfig(cwd);
      const env = { ...process.env, ...loadUserCredentials() };
      const nameHint = String(req?.name ?? "").trim();
      const r = await completeChat({
        config,
        env,
        request: {
          temperature: 0.2,
          maxTokens: 1200,
          messages: [
            { role: "system", content: SKILL_DRAFT_SYSTEM },
            {
              role: "user",
              content: [nameHint ? `名称建议：${nameHint}` : "", `需求：${brief.slice(0, 2000)}`]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        },
      });
      const markdown = unwrapSkillMarkdown(sanitizeCompletion(r.text));
      if (!markdown) return { markdown: "", error: "模型没有返回 Skill 正文" };
      return { markdown, model: r.model };
    } catch (err) {
      return {
        markdown: "",
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      };
    }
  });
}
