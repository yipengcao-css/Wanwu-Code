import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { gitStatus, parseGitPorcelain } from "./gitStatus.js";

describe("parseGitPorcelain", () => {
  it("parses modified, added, untracked", () => {
    const rows = parseGitPorcelain(" M src/a.ts\nA  src/b.ts\n?? new.md\n");
    expect(rows).toEqual([
      { path: "src/a.ts", code: "M", raw: " M" },
      { path: "src/b.ts", code: "A", raw: "A " },
      { path: "new.md", code: "?", raw: "??" },
    ]);
  });

  it("uses rename target path", () => {
    const rows = parseGitPorcelain("R  old.ts -> src/new.ts\n");
    expect(rows[0]?.path).toBe("src/new.ts");
    expect(rows[0]?.code).toBe("R");
  });

  it("reads a real git worktree", () => {
    const dir = mkdtempSync(join(tmpdir(), "wanwu-git-status-"));
    execFileSync("git", ["init"], { cwd: dir });
    writeFileSync(join(dir, "fresh.txt"), "x");
    const rows = gitStatus(dir);
    expect(rows.some((r) => r.path === "fresh.txt" && r.code === "?")).toBe(true);
  });
});
