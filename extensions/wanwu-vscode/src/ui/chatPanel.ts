import * as vscode from "vscode";
import type { WanwuMode } from "../modes";
import { AcpClient, type AcpEditProposal, type AcpPermissionRequest } from "../acp/client";
import { startAcpProcess } from "../acp/process";
import { askToolPermission } from "./permissionModal";
import { reviewSingleFileDiff } from "./diffReview";
import { findExtensionWorkspaceRoot } from "../workspaceRoot";
import { SessionManager } from "./sessionManager";
import { chatWebviewHtml } from "./chatHtml";

export class WanwuChatPanel {
  public static current: WanwuChatPanel | undefined;
  private readonly webview: vscode.Webview;
  private readonly revealFn: () => void;
  private client: AcpClient | undefined;
  private sessionId: string | undefined;
  private mode: WanwuMode = "agent";
  private disposed = false;
  readonly localId: string;

  private constructor(
    webview: vscode.Webview,
    revealFn: () => void,
    private readonly context: vscode.ExtensionContext,
    localId: string,
    title: string,
    compact?: boolean,
  ) {
    this.webview = webview;
    this.revealFn = revealFn;
    this.localId = localId;
    this.webview.html = chatWebviewHtml({ title, compact });
    this.webview.onDidReceiveMessage(async (msg: { type?: string; text?: string; mode?: string }) => {
      await this.onWebviewMessage(msg);
    });
  }

  reveal(): void {
    this.revealFn();
  }

  /** Send a pre-filled prompt programmatically (e.g. Quick Fix with diagnostic). */
  async sendPrefilled(text: string, mode: WanwuMode = "agent"): Promise<void> {
    this.reveal();
    await this.webview.postMessage({ type: "user", text });
    await this.handleSend(text, mode);
  }

  /** Open a new parallel session panel (or reuse singleton when forceNew=false). */
  static show(context: vscode.ExtensionContext, opts?: { forceNew?: boolean }): WanwuChatPanel {
    if (!opts?.forceNew && WanwuChatPanel.current && !WanwuChatPanel.current.disposed) {
      WanwuChatPanel.current.reveal();
      return WanwuChatPanel.current;
    }
    const localId = `session-${Date.now().toString(36)}`;
    const panel = vscode.window.createWebviewPanel(
      "wanwuChat",
      `Wanwu Chat (${localId})`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    const instance = new WanwuChatPanel(
      panel.webview,
      () => panel.reveal(vscode.ViewColumn.Beside),
      context,
      localId,
      `Wanwu Chat ${localId}`,
    );
    panel.onDidDispose(() => instance.dispose());
    WanwuChatPanel.current = instance;
    SessionManager.register(localId, instance);
    return instance;
  }

  static bindView(view: vscode.WebviewView, context: vscode.ExtensionContext): WanwuChatPanel {
    const localId = `sidebar-${Date.now().toString(36)}`;
    view.webview.options = { enableScripts: true };
    const instance = new WanwuChatPanel(
      view.webview,
      () => view.show?.(true),
      context,
      localId,
      "Wanwu Agent",
      true,
    );
    view.onDidDispose(() => instance.dispose());
    WanwuChatPanel.current = instance;
    SessionManager.register(localId, instance);
    return instance;
  }

  private async ensureClient(): Promise<AcpClient> {
    if (this.client) return this.client;
    const workspaceRoot = findExtensionWorkspaceRoot();
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? workspaceRoot;
    const useMock =
      vscode.workspace.getConfiguration("wanwu").get<boolean>("useMockAcp") === true ||
      process.env.WANWU_ACP_MOCK === "1";
    const child = startAcpProcess({
      cwd: folder,
      workspaceRoot,
      extensionPath: this.context.extensionPath,
      repoRoot: workspaceRoot,
      commandOverride: process.env.WANWU_ACP_COMMAND,
      useMock: Boolean(useMock),
    });
    const client = new AcpClient(child);
    client.on("message", (text: string) => {
      void this.webview.postMessage({ type: "assistant", text });
    });
    client.on("tool", (tool: { title: string; status: string; detail?: string }) => {
      void this.webview.postMessage({
        type: "tool",
        text: `${tool.status} ${tool.title}${tool.detail ? `: ${tool.detail}` : ""}`,
      });
    });
    client.on("permission", (req: AcpPermissionRequest) => {
      void (async () => {
        const decision = await askToolPermission(req.toolName, `${req.summary} (risk=${req.risk ?? "?"})`);
        client.respond(req.id, { optionId: decision });
        void this.webview.postMessage({
          type: "status",
          text: `permission ${decision} for ${req.toolName}`,
        });
      })();
    });
    client.on("edit", (edit: AcpEditProposal) => {
      void (async () => {
        void this.webview.postMessage({
          type: "tool",
          text: `pending Edit: ${edit.path}`,
        });
        const decision = await reviewSingleFileDiff(edit, findExtensionWorkspaceRoot());
        if (decision === "accept") {
          void this.webview.postMessage({
            type: "status",
            text: `accepted edit → ${edit.path}`,
          });
        } else {
          void this.webview.postMessage({
            type: "status",
            text: `rejected edit → ${edit.path}`,
          });
        }
      })();
    });
    client.on("error", (err: Error) => {
      void this.webview.postMessage({ type: "error", text: err.message });
    });
    await client.initialize();
    this.sessionId = await client.newSession();
    this.client = client;
    return client;
  }

  private collectEditorContext(): string {
    const editor = vscode.window.activeTextEditor;
    const parts: string[] = [];
    if (editor) {
      parts.push(`Open file: ${editor.document.uri.fsPath}`);
      const sel = editor.document.getText(editor.selection);
      if (sel.trim()) {
        parts.push(`Selection:\n\`\`\`\n${sel.slice(0, 4000)}\n\`\`\``);
      }
    }
    const diags = vscode.languages.getDiagnostics();
    const top = diags
      .flatMap(([uri, items]) =>
        items.slice(0, 5).map((d) => `${uri.fsPath}:${d.range.start.line + 1} ${d.message}`),
      )
      .slice(0, 20);
    if (top.length > 0) {
      parts.push(`Diagnostics:\n${top.join("\n")}`);
    }
    return parts.length ? `[EDITOR_CONTEXT]\n${parts.join("\n\n")}\n[/EDITOR_CONTEXT]\n` : "";
  }

  private async handleSend(text: string, mode: WanwuMode): Promise<void> {
    this.mode = mode;
    const prefix =
      mode === "plan"
        ? "[MODE=plan] 只产出计划，不要修改文件。\n"
        : mode === "ask"
          ? "[MODE=ask] 只回答问题，不要修改文件。\n"
          : mode === "verify"
            ? "[MODE=verify] 验证最近变更（测试/lint），不要继续写功能。\n"
            : mode === "debug"
              ? "[MODE=debug] 先假设再插桩（WANWU_DEBUG），等用户复现后再定点修并清理。\n"
              : "[MODE=agent] 可以在权限允许下修改代码。\n";
    const context = this.collectEditorContext();

    try {
      await this.webview.postMessage({ type: "status", text: "connecting…" });
      const client = await this.ensureClient();
      await this.webview.postMessage({ type: "status", text: `session=${this.sessionId}` });
      await client.prompt(this.sessionId ?? "unknown", `${prefix}${context}${text}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.webview.postMessage({ type: "error", text: message });
      await vscode.window.showErrorMessage(`Wanwu ACP error: ${message}`);
    }
  }

  async cancel(): Promise<void> {
    try {
      if (this.client) {
        await this.client.cancelSession(this.sessionId);
        await this.webview.postMessage({ type: "status", text: "已停止" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.webview.postMessage({ type: "error", text: message });
    }
  }

  async resumeFromDisk(): Promise<void> {
    try {
      const client = await this.ensureClient();
      const { sessions } = await client.listSessions();
      if (!sessions.length) {
        await this.webview.postMessage({ type: "status", text: "没有可恢复的会话" });
        return;
      }
      const labels = sessions.map((s) => ({
        label: s.preview?.slice(0, 60) || s.id,
        description: s.id,
        id: s.id,
      }));
      const pick =
        labels.length === 1
          ? labels[0]
          : await vscode.window.showQuickPick(labels, { title: "恢复 Wanwu 会话" });
      if (!pick) return;
      const loaded = await client.loadSession(pick.id);
      this.sessionId = loaded.sessionId;
      await this.webview.postMessage({ type: "clear" });
      await this.webview.postMessage({
        type: "status",
        text: `已恢复 ${loaded.sessionId} · ${loaded.history?.length ?? 0} 条`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.webview.postMessage({ type: "error", text: message });
    }
  }

  private async onWebviewMessage(msg: { type?: string; text?: string; mode?: string }): Promise<void> {
    if (msg?.type === "send") {
      await this.handleSend(String(msg.text ?? ""), String(msg.mode ?? this.mode) as WanwuMode);
    }
    if (msg?.type === "setMode") {
      this.mode = String(msg.mode) as WanwuMode;
    }
    if (msg?.type === "cancel") {
      await this.cancel();
    }
    if (msg?.type === "resume") {
      await this.resumeFromDisk();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.client?.dispose();
    this.client = undefined;
    SessionManager.unregister(this.localId);
    if (WanwuChatPanel.current === this) {
      WanwuChatPanel.current = undefined;
    }
  }
}
