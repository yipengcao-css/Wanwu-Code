export type LogItem =
  | { kind: "user" | "assistant" | "error" | "status"; text: string }
  | { kind: "tool"; id?: string; title: string; status: string; detail?: string };

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p) => (p && typeof p === "object" && "type" in p && p.type === "text" && "text" in p ? String(p.text) : ""))
    .filter(Boolean)
    .join("\n");
}

export function stripPromptChrome(text: string): string {
  return text
    .replace(/\[MODE=\w+\][^\n]*\n?/g, "")
    .replace(/\[EDITOR_CONTEXT\][\s\S]*?\[\/EDITOR_CONTEXT\]\n?/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

/** Rebuild the Agent Studio log from a persisted ACP transcript. */
export function historyToLog(history: unknown[]): LogItem[] {
  const log: LogItem[] = [{ kind: "status", text: "已恢复会话" }];
  for (const raw of history) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as { role?: string; content?: unknown; name?: string };
    if (m.role === "user") {
      const t = stripPromptChrome(flattenContent(m.content));
      if (t) log.push({ kind: "user", text: t });
    } else if (m.role === "assistant") {
      const t = flattenContent(m.content).trim();
      if (t) log.push({ kind: "assistant", text: t });
    } else if (m.role === "tool") {
      const detail = flattenContent(m.content).trim();
      log.push({
        kind: "tool",
        title: String(m.name ?? "tool"),
        status: "completed",
        detail: detail ? detail.slice(0, 200) : undefined,
      });
    }
  }
  return log;
}

export type TodoRow = { status: "pending" | "in_progress" | "completed"; content: string };

/** Parse the Todo tool's text payload (`2/3 completed` + ○/◐/● lines). */
export function parseTodoToolText(detail?: string): TodoRow[] | null {
  if (!detail) return null;
  const lines = detail.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.some((l) => /^\d+\/\d+ completed/.test(l))) return null;
  const items: TodoRow[] = [];
  for (const line of lines) {
    const m = line.match(/^([○◐●])\s+(.+)/);
    if (!m) continue;
    const status = m[1] === "●" ? "completed" : m[1] === "◐" ? "in_progress" : "pending";
    items.push({ status, content: m[2]! });
  }
  return items.length ? items : null;
}

/** True when the Debug tool asked the user to reproduce. */
export function parseDebugWaiting(title: string, detail?: string): boolean | null {
  if (title !== "Debug") return null;
  if (!detail) return false;
  return /WAIT_FOR_REPRO/.test(detail);
}

/** Upsert a tool chip by id (Cursor-style in-place status). */
export function upsertToolLog(
  prev: LogItem[],
  tool: { id?: string; title: string; status: string; detail?: string },
): LogItem[] {
  const next: LogItem = {
    kind: "tool",
    id: tool.id,
    title: tool.title,
    status: tool.status,
    detail: tool.detail,
  };
  if (tool.id) {
    const idx = prev.findIndex((item) => item.kind === "tool" && item.id === tool.id);
    if (idx >= 0) {
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    }
  }
  return [...prev, next];
}
