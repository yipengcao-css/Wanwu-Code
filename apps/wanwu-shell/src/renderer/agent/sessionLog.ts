export type LogItem =
  | { kind: "user" | "assistant" | "error" | "status" | "thought"; text: string }
  | { kind: "tool"; id?: string; title: string; status: string; detail?: string };

export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "think"; text: string }
  | { type: "code"; lang: string; text: string; lines: number };

const CODE_FENCE = /```([^\n`]*)\n([\s\S]*?)```/g;
const THINK_TAG = /<think(?:ing)?>\s*([\s\S]*?)<\/think(?:ing)?>/gi;

function clip(text: string, max = 160): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max)}…`;
}

/** Collapse tool dumps to a one-line process hint. */
export function summarizeToolDetail(_title: string, detail?: string): string {
  if (!detail?.trim()) return "";
  const trimmed = detail.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const pick = (key: string): string | undefined =>
      typeof parsed[key] === "string" && parsed[key].trim() ? parsed[key].trim() : undefined;
    const bits = ["action", "command", "query", "pattern", "path", "url"]
      .map(pick)
      .filter((v): v is string => Boolean(v));
    if (bits.length) return clip(bits.join(" · "));
  } catch {
    const loose = trimmed.match(/"(?:query|command|path|url|pattern)"\s*:\s*"([^"]*)/);
    if (loose?.[1]) return clip(loose[1]);
  }
  const pathHit = trimmed.match(/(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.\w+)/);
  const lines = trimmed.split("\n").length;
  if (pathHit && lines > 3) return `${pathHit[1]} · ${lines} 行`;
  if (lines > 4) return `${lines} 行`;
  return clip(trimmed.split("\n")[0] ?? trimmed, 96);
}

/** One-line preview so a collapsed thought still shows what it contains. */
export function thoughtPreview(text: string): string {
  return clip(text.replace(/<\/?think(?:ing)?>/gi, ""), 72);
}

/** Split assistant text so thinking and long fences can be folded. */
export function splitMessageBlocks(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  const thinkPieces: string[] = [];
  let withoutThink = text.replace(THINK_TAG, (_m, inner: string) => {
    if (inner.trim()) thinkPieces.push(inner.trim());
    return "";
  });
  const open = withoutThink.match(/<think(?:ing)?>\s*([\s\S]*)$/i);
  if (open && open.index !== undefined) {
    if (open[1]?.trim()) thinkPieces.push(open[1].trim());
    withoutThink = withoutThink.slice(0, open.index);
  }
  for (const t of thinkPieces) blocks.push({ type: "think", text: t });

  let last = 0;
  CODE_FENCE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const body = withoutThink;
  while ((m = CODE_FENCE.exec(body))) {
    const before = body.slice(last, m.index).trim();
    if (before) blocks.push({ type: "text", text: before });
    const lang = (m[1] ?? "").trim();
    const code = (m[2] ?? "").replace(/\n$/, "");
    blocks.push({ type: "code", lang, text: code, lines: code.split("\n").length });
    last = m.index + m[0].length;
  }
  const tail = body.slice(last).trim();
  if (tail) blocks.push({ type: "text", text: tail });
  if (!blocks.length && text.trim()) blocks.push({ type: "text", text: text.trim() });
  return blocks;
}

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
    .replace(/\[SKILLS=[^\]]*\]\n?/g, "")
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
        detail: detail ? detail.slice(0, 4000) : undefined,
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

/**
 * Append a streaming thought or answer.
 * Chunks of the same kind stay one block until a user message or tool call,
 * even when thought and answer tokens alternate.
 */
export function appendStreamText(
  prev: LogItem[],
  kind: "thought" | "assistant",
  text: string,
): LogItem[] {
  if (!text) return prev;
  for (let i = prev.length - 1; i >= 0; i--) {
    const item = prev[i];
    if (!item || item.kind === "user" || item.kind === "tool") break;
    if (item.kind === kind) {
      const copy = prev.slice();
      copy[i] = { kind, text: item.text + text };
      return copy;
    }
  }
  return [...prev, { kind, text }];
}

export function appendThought(prev: LogItem[], text: string): LogItem[] {
  return appendStreamText(prev, "thought", text);
}
