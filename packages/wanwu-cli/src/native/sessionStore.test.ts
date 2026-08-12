import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listSessions, loadSession, saveSession } from "./sessionStore.js";

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
});
