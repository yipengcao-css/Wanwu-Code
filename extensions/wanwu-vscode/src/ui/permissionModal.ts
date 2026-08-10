import * as vscode from "vscode";

export type PermissionChoice = "allow-once" | "allow-session" | "deny";

export async function askToolPermission(toolName: string, summary: string): Promise<PermissionChoice> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: "Allow once", description: "仅允许本次", id: "allow-once" as const },
      { label: "Allow session", description: "本会话内允许同类操作", id: "allow-session" as const },
      { label: "Deny", description: "拒绝", id: "deny" as const },
    ],
    {
      title: `Wanwu 权限请求：${toolName}`,
      placeHolder: summary,
      ignoreFocusOut: true,
    },
  );
  return pick?.id ?? "deny";
}