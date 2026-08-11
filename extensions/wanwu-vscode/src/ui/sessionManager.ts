import * as vscode from "vscode";

export interface SessionPanel {
  reveal(): void;
  dispose(): void;
}

/** Tracks multiple Wanwu Chat sessions (parallel agents). */
export class SessionManager {
  private static panels = new Map<string, SessionPanel>();

  static list(): string[] {
    return [...SessionManager.panels.keys()];
  }

  static register(id: string, panel: SessionPanel): void {
    SessionManager.panels.set(id, panel);
  }

  static unregister(id: string): void {
    SessionManager.panels.delete(id);
  }

  static get(id: string): SessionPanel | undefined {
    return SessionManager.panels.get(id);
  }

  static async pickAndReveal(): Promise<void> {
    const ids = SessionManager.list();
    if (ids.length === 0) {
      await vscode.window.showInformationMessage("没有活动的 Wanwu 会话");
      return;
    }
    const pick = await vscode.window.showQuickPick(ids, { title: "Wanwu Sessions" });
    if (!pick) return;
    SessionManager.get(pick)?.reveal();
  }

  static disposeAll(): void {
    for (const panel of SessionManager.panels.values()) {
      panel.dispose();
    }
    SessionManager.panels.clear();
  }
}