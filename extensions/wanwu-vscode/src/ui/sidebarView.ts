import * as vscode from "vscode";
import { WanwuChatPanel } from "./chatPanel";

export class WanwuSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "wanwu.chatView";

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    WanwuChatPanel.bindView(webviewView, this.context);
  }
}
