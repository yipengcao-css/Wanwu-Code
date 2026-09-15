import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolResult } from "./tools.js";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

function todosPath(workspaceRoot: string, sessionId: string): string {
  const safe = sessionId.replace(/[^\w.-]/g, "_");
  return join(workspaceRoot, ".wanwu", "todos", `${safe}.json`);
}

export function readTodos(workspaceRoot: string, sessionId: string): TodoItem[] {
  const path = todosPath(workspaceRoot, sessionId);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .map((it): TodoItem | undefined => {
        if (!it || typeof it !== "object") return undefined;
        const o = it as Record<string, unknown>;
        if (typeof o.content !== "string" || !o.content.trim()) return undefined;
        const status: TodoStatus =
          o.status === "in_progress" || o.status === "completed" ? o.status : "pending";
        return { content: o.content, status };
      })
      .filter((x): x is TodoItem => x !== undefined);
  } catch {
    return [];
  }
}

export function renderTodos(items: TodoItem[]): string {
  if (!items.length) return "(todo list empty)";
  const icon: Record<TodoStatus, string> = {
    pending: "○",
    in_progress: "◐",
    completed: "●",
  };
  const done = items.filter((i) => i.status === "completed").length;
  const lines = items.map((i) => `${icon[i.status]} ${i.content}`);
  return [`${done}/${items.length} completed`, ...lines].join("\n");
}

/**
 * Todo tool: full-list replace semantics (Claude-Code style). The agent
 * rewrites the whole list each call, which keeps state transitions simple
 * and auditable. Persisted per session for resume.
 */
export function toolTodo(
  workspaceRoot: string,
  sessionId: string,
  items: TodoItem[],
): ToolResult {
  const cleaned = items
    .filter((i) => typeof i?.content === "string" && i.content.trim())
    .map((i) => ({
      content: i.content.trim(),
      status: (["pending", "in_progress", "completed"] as const).includes(i.status)
        ? i.status
        : ("pending" as const),
    }));
  const path = todosPath(workspaceRoot, sessionId);
  try {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify({ items: cleaned, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch (err) {
    return { ok: false, title: "Todo", text: `failed to persist todos: ${String(err)}` };
  }
  return { ok: true, title: "Todo", text: renderTodos(cleaned) };
}
