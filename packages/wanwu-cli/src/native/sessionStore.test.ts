import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deleteSession, listSessionSummaries, listSessions, loadSession, renameSession, saveSession, sessionPreview } from "./sessionStore.js";

describe("sessionStore", () => {
  it("saves and loads session history", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-session-"));
    saveSession({
      id: "s1",
      workspaceRoot: root,
      createdAt: "2026-08-12T00:00:00Z",
      updatedAt: "2026-08-12T00:00:00Z",
      history: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    });
    const loaded = loadSession(root, "s1");
    expect(loaded?.history).toHaveLength(2);
  });

  it("lists sessions sorted by updatedAt desc", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-session-list-"));
    saveSession({
      id: "old",
      workspaceRoot: root,
      createdAt: "2026-08-11T00:00:00Z",
      updatedAt: "2026-08-11T00:00:00Z",
      history: [],
    });
    saveSession({
      id: "new",
      workspaceRoot: root,
      createdAt: "2026-08-12T00:00:00Z",
      updatedAt: "2026-08-12T00:00:00Z",
      history: [],
    });
    const list = listSessions(root);
    expect(list.map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("builds a preview from the first user turn", () => {
    expect(
      sessionPreview([
        { role: "user", content: "[MODE=agent]\n[EDITOR_CONTEXT]\nActive file: a.ts\n[/EDITOR_CONTEXT]\nfix the login bug" },
        { role: "assistant", content: "ok" },
      ]),
    ).toBe("fix the login bug");
    const root = mkdtempSync(join(tmpdir(), "wanwu-session-sum-"));
    saveSession({
      id: "s2",
      workspaceRoot: root,
      createdAt: "2026-08-12T00:00:00Z",
      updatedAt: "2026-08-12T00:00:00Z",
      history: [{ role: "user", content: "remember this" }],
    });
    expect(listSessionSummaries(root)[0]?.preview).toBe("remember this");
  });

  it("deletes a session file and ignores unsafe ids", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-session-del-"));
    saveSession({
      id: "gone",
      workspaceRoot: root,
      createdAt: "2026-08-12T00:00:00Z",
      updatedAt: "2026-08-12T00:00:00Z",
      history: [],
    });
    expect(deleteSession(root, "../gone")).toBe(false);
    expect(loadSession(root, "gone")).toBeTruthy();
    expect(deleteSession(root, "gone")).toBe(true);
    expect(loadSession(root, "gone")).toBeUndefined();
    expect(deleteSession(root, "gone")).toBe(false);
  });

  it("keeps a renamed title when history is saved again", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-session-rename-"));
    saveSession({
      id: "s3",
      workspaceRoot: root,
      createdAt: "2026-08-12T00:00:00Z",
      updatedAt: "2026-08-12T00:00:00Z",
      history: [{ role: "user", content: "hello" }],
    });
    expect(renameSession(root, "s3", "登录修复")).toBe(true);
    saveSession({
      id: "s3",
      workspaceRoot: root,
      createdAt: "2026-08-12T00:00:00Z",
      updatedAt: "2026-08-12T01:00:00Z",
      history: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "ok" },
      ],
    });
    expect(loadSession(root, "s3")?.title).toBe("登录修复");
    expect(listSessionSummaries(root)[0]?.title).toBe("登录修复");
    expect(renameSession(root, "../s3", "nope")).toBe(false);
  });
});
