import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSnapshot, validateSnapshotSize } from "./snapshot.js";
import { unpackSnapshot, verifySnapshotSha256 } from "./snapshotUnpack.js";

describe("snapshot", () => {
  it("creates and unpacks a git archive snapshot", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-snap-src-"));
    writeFileSync(join(root, "README.md"), "# test\n", "utf8");
    writeFileSync(join(root, ".env"), "SECRET=1\n", "utf8");

    // git archive only includes tracked files
    const { execSync } = require("node:child_process");
    execSync("git init && git add README.md && git -c user.email=t@t -c user.name=t commit -m init", {
      cwd: root,
      stdio: "ignore",
    });

    const outDir = mkdtempSync(join(tmpdir(), "wanwu-snap-out-"));
    const snap = createSnapshot(root, outDir);
    expect(snap.bytes).toBeGreaterThan(0);
    expect(verifySnapshotSha256(snap.path, snap.sha256)).toBe(true);

    const target = mkdtempSync(join(tmpdir(), "wanwu-snap-target-"));
    unpackSnapshot(snap.path, target);
    expect(require("node:fs").existsSync(join(target, "README.md"))).toBe(true);
  });

  it("rejects oversized snapshot", () => {
    expect(() => validateSnapshotSize(200 * 1024 * 1024)).toThrow(/too large/);
  });
});
