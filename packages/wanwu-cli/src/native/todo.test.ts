import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTodos, renderTodos, toolTodo } from "./todo.js";

describe("Todo tool", () => {
  it("writes and reads back a list", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-todo-"));
    const r = toolTodo(root, "s1", [
      { content: "设计", status: "completed" },
      { content: "实现", status: "in_progress" },
      { content: "测试", status: "pending" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.text).toContain("1/3 completed");
    const back = readTodos(root, "s1");
    expect(back).toHaveLength(3);
    expect(back[1]).toEqual({ content: "实现", status: "in_progress" });
  });

  it("full-list replace semantics", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-todo-"));
    toolTodo(root, "s1", [{ content: "a", status: "pending" }]);
    toolTodo(root, "s1", [{ content: "b", status: "completed" }]);
    const back = readTodos(root, "s1");
    expect(back).toEqual([{ content: "b", status: "completed" }]);
  });

  it("normalizes invalid status and drops empty items", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-todo-"));
    const r = toolTodo(root, "s1", [
      { content: "ok", status: "bogus" as never },
      { content: "  ", status: "pending" },
    ]);
    expect(r.ok).toBe(true);
    expect(readTodos(root, "s1")).toEqual([{ content: "ok", status: "pending" }]);
  });

  it("sessions are isolated", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-todo-"));
    toolTodo(root, "s1", [{ content: "a", status: "pending" }]);
    expect(readTodos(root, "s2")).toEqual([]);
  });

  it("renderTodos handles empty list", () => {
    expect(renderTodos([])).toMatch(/empty/);
  });
});
