import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  latestCheckpoint,
  listCheckpoints,
  newTurnId,
  pruneCheckpoints,
  recordFileBackup,
  restoreCheckpoint,
} from "./checkpoints.js";
import { dispatchTool } from "./toolDispatch.js";

describe("checkpoints", () => {
  it("backs up before-state and restores modified files", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ckpt-"));
    writeFileSync(join(root, "a.ts"), "original\n", "utf8");
    const turn = newTurnId("s1");
    recordFileBackup(root, turn, "s1", "a.ts");
    writeFileSync(join(root, "a.ts"), "broken\n", "utf8");
    const r = restoreCheckpoint(root, turn);
    expect(r.restored).toEqual(["a.ts"]);
    expect(readFileSync(join(root, "a.ts"), "utf8")).toBe("original\n");
  });

  it("deletes files created by the turn on restore", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ckpt-"));
    const turn = newTurnId("s1");
    recordFileBackup(root, turn, "s1", "new.ts");
    writeFileSync(join(root, "new.ts"), "agent made this\n", "utf8");
    const r = restoreCheckpoint(root, turn);
    expect(r.deleted).toEqual(["new.ts"]);
    expect(existsSync(join(root, "new.ts"))).toBe(false);
  });

  it("first backup wins within a turn", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ckpt-"));
    writeFileSync(join(root, "a.ts"), "v1\n", "utf8");
    const turn = newTurnId("s1");
    recordFileBackup(root, turn, "s1", "a.ts");
    writeFileSync(join(root, "a.ts"), "v2\n", "utf8");
    recordFileBackup(root, turn, "s1", "a.ts"); // must not overwrite backup
    writeFileSync(join(root, "a.ts"), "v3\n", "utf8");
    restoreCheckpoint(root, turn);
    expect(readFileSync(join(root, "a.ts"), "utf8")).toBe("v1\n");
  });

  it("lists newest first and prunes", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ckpt-"));
    for (let i = 0; i < 5; i += 1) {
      const turn = `t${i}`;
      writeFileSync(join(root, `f${i}.ts`), `${i}\n`, "utf8");
      recordFileBackup(root, turn, "s1", `f${i}.ts`);
      // ensure distinct createdAt ordering
      const meta = join(root, ".wanwu", "checkpoints", turn, "meta.json");
      const raw = JSON.parse(readFileSync(meta, "utf8"));
      raw.createdAt = new Date(1000 + i).toISOString();
      writeFileSync(meta, JSON.stringify(raw));
    }
    const all = listCheckpoints(root);
    expect(all[0]!.id).toBe("t4");
    const pruned = pruneCheckpoints(root, 2);
    expect(pruned).toBe(3);
    expect(listCheckpoints(root).map((c) => c.id)).toEqual(["t4", "t3"]);
  });

  it("latestCheckpoint returns undefined when empty", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ckpt-"));
    expect(latestCheckpoint(root)).toBeUndefined();
  });
});

describe("checkpoint wiring in dispatchTool", () => {
  it("applied Edit records a backup; restore undoes it", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ckpt-"));
    writeFileSync(join(root, "a.ts"), "before\n", "utf8");
    const r = await dispatchTool(
      {
        workspaceRoot: root,
        sessionId: "s1",
        permissionMode: "accept-edits",
        mode: "agent",
        turnId: "turn-1",
      },
      "agent",
      "Edit",
      JSON.stringify({ path: "a.ts", edits: [{ old_string: "before", new_string: "after" }] }),
    );
    expect(r.applied).toBe(true);
    expect(readFileSync(join(root, "a.ts"), "utf8")).toBe("after\n");
    const restored = restoreCheckpoint(root, "turn-1");
    expect(restored.restored).toEqual(["a.ts"]);
    expect(readFileSync(join(root, "a.ts"), "utf8")).toBe("before\n");
  });

  it("propose-only edits record nothing", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ckpt-"));
    writeFileSync(join(root, "a.ts"), "before\n", "utf8");
    await dispatchTool(
      {
        workspaceRoot: root,
        sessionId: "s1",
        permissionMode: "accept-edits",
        mode: "agent",
        // no turnId → no checkpoint (propose/CLI-less path)
      },
      "agent",
      "Edit",
      JSON.stringify({ path: "a.ts", edits: [{ old_string: "before", new_string: "after" }] }),
    );
    expect(listCheckpoints(root)).toEqual([]);
  });
});
