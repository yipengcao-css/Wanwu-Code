import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupParallel, runParallelMarkers } from "./parallel.js";

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wanwu-parallel-"));
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "wanwu@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Wanwu"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# tmp\n", "utf8");
  spawnSync("git", ["add", "."], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  mkdirSync(join(dir, ".wanwu"), { recursive: true });
  return dir;
}

describe("parallel worktrees", () => {
  let root = "";

  afterEach(() => {
    if (root) {
      cleanupParallel(root, ["a", "b"]);
      rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("isolates marker files so main checkout is untouched", () => {
    root = initRepo();
    const result = runParallelMarkers(root, [
      {
        name: "a",
        markerRelativePath: ".wanwu/agent-a.marker",
        markerContents: "agent-a-unique",
      },
      {
        name: "b",
        markerRelativePath: ".wanwu/agent-b.marker",
        markerContents: "agent-b-unique",
      },
    ]);
    expect(result.agents).toHaveLength(2);
    expect(result.collidedOnMain).toBe(false);
  });
});