import * as vscode from "vscode";
import type { WanwuMode } from "../modes";
import { AcpClient } from "../acp/client";
import { startAcpProcess } from "../acp/process";
import { findExtensionWorkspaceRoot } from "../workspaceRoot";

export class WanwuChatPanel {
  public static current: WanwuChatPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private client: AcpClient | undefined;
  private sessionId: string | undefined;
  private mode: WanwuMode = "agent";
  private disposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.panel = panel;
    void this.context;
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "send") {
        await this.handleSend(String(msg.text ?? ""), String(msg.mode ?? this.mode) as WanwuMode);
      }
      if (msg?.type === "setMode") {
        this.mode = String(msg.mode) as WanwuMode;
      }
    });
    this.panel.onDidDispose(() => this.dispose());
  }

  static show(context: vscode.ExtensionContext): WanwuChatPanel {
    if (WanwuChatPanel.current) {
      WanwuChatPanel.current.panel.reveal();
      return WanwuChatPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      "wanwuChat",
      "Wanwu Chat",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    WanwuChatPanel.current = new WanwuChatPanel(panel, context);
    return WanwuChatPanel.current;
  }

  private async ensureClient(): Promise<AcpClient> {
    if (this.client) return this.client;
    const workspaceRoot = findExtensionWorkspaceRoot();
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? workspaceRoot;
    const useMock =
      vscode.workspace.getConfiguration("wanwu").get<boolean>("useMockAcp") ??
      process.env.WANWU_ACP_MOCK === "1";
    const child = startAcpProcess({
      cwd: folder,
      workspaceRoot,
      commandOverride: process.env.WANWU_ACP_COMMAND,
      useMock: Boolean(useMock),
    });
    const client = new AcpClient(child);
    client.on("message", (text: string) => {
      void this.panel.webview.postMessage({ type: "assistant", text });
    });
    client.on("error", (err: Error) => {
      void this.panel.webview.postMessage({ type: "error", text: err.message });
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
            : "[MODE=agent] 可以在权限允许下修改代码。\n";
    const context = this.collectEditorContext();

    try {
      await this.panel.webview.postMessage({ type: "status", text: "connecting…" });
      const client = await this.ensureClient();
      await this.panel.webview.postMessage({ type: "status", text: `session=${this.sessionId}` });
      await client.prompt(this.sessionId ?? "unknown", `${prefix}${context}${text}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.panel.webview.postMessage({ type: "error", text: message });
      await vscode.window.showErrorMessage(`Wanwu ACP error: ${message}`);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.client?.dispose();
    this.client = undefined;
    WanwuChatPanel.current = undefined;
  }

  private html(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wanwu Chat</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; padding: 12px; }
    #log { height: calc(100vh - 140px); overflow: auto; white-space: pre-wrap; border: 1px solid var(--vscode-panel-border); padding: 8px; }
    .row { display: flex; gap: 8px; margin-top: 8px; }
    select, button, textarea { font: inherit; }
    textarea { width: 100%; min-height: 64px; }
    .user { color: var(--vscode-textLink-foreground); }
    .assistant { color: var(--vscode-foreground); }
    .error { color: var(--vscode-errorForeground); }
    .status { opacity: 0.7; font-size: 12px; }
  </style>
</head>
<body>
  <h3>Wanwu Chat</h3>
  <div class="row">
    <label>Mode
      <select id="mode">
        <option value="ask">Ask</option>
        <option value="plan">Plan</option>
        <option value="agent" selected>Agent</option>
        <option value="verify">Verify</option>
      </select>
    </label>
    <span id="status" class="status">idle</span>
  </div>
  <div id="log"></div>
  <textarea id="input" placeholder="描述你的任务…"></textarea>
  <div class="row">
    <button id="send">发送</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const log = document.getElementById('log');
    const input = document.getElementById('input');
    const mode = document.getElementById('mode');
    const status = document.getElementById('status');
    function append(cls, text) {
      const div = document.createElement('div');
      div.className = cls;
      div.textContent = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }
    document.getElementById('send').onclick = () => {
      const text = input.value.trim();
      if (!text) return;
      append('user', 'You: ' + text);
      vscode.postMessage({ type: 'send', text, mode: mode.value });
      input.value = '';
    };
    mode.onchange = () => vscode.postMessage({ type: 'setMode', mode: mode.value });
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'assistant') append('assistant', 'Wanwu: ' + msg.text);
      if (msg.type === 'error') append('error', 'Error: ' + msg.text);
      if (msg.type === 'status') status.textContent = msg.text;
    });
  </script>
</body>
</html>`;
  }
}