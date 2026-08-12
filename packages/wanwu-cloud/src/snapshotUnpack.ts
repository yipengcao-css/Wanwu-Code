import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export interface UnpackOptions {
  maxBytes?: number;
  maxFiles?: number;
}

/**
 * Safely extract a snapshot into a workspace directory.
 * Rejects path traversal and enforces size/file limits.
 */
export function unpackSnapshot(
  snapshotPath: string,
  targetDir: string,
  opts?: UnpackOptions,
): void {
  const maxBytes = opts?.maxBytes ?? 500 * 1024 * 1024;
  const maxFiles = opts?.maxFiles ?? 50_000;

  if (!existsSync(snapshotPath)) {
    throw new Error(`snapshot not found: ${snapshotPath}`);
  }

  const content = readFileSync(snapshotPath);
  if (content.length > maxBytes) {
    throw new Error(`snapshot too large: ${content.length} > ${maxBytes}`);
  }

  mkdirSync(targetDir, { recursive: true });

  // List contents to check for traversal and file count
  const list = spawnSync("tar", ["-tzf", snapshotPath], { encoding: "utf8" });
  if (list.status !== 0) {
    throw new Error(`invalid snapshot: ${list.stderr}`);
  }
  const files = (list.stdout ?? "").split("\n").filter(Boolean);
  if (files.length > maxFiles) {
    throw new Error(`too many files: ${files.length} > ${maxFiles}`);
  }
  for (const f of files) {
    if (f.startsWith("/") || f.includes("..")) {
      throw new Error(`unsafe path in snapshot: ${f}`);
    }
  }

  const extract = spawnSync("tar", ["-xzf", snapshotPath, "-C", targetDir], {
    encoding: "utf8",
  });
  if (extract.status !== 0) {
    throw new Error(`extract failed: ${extract.stderr}`);
  }

  // If no .git, initialize one so runner can commit
  if (!existsSync(join(targetDir, ".git"))) {
    spawnSync("git", ["init"], { cwd: targetDir });
    spawnSync("git", ["add", "."], { cwd: targetDir });
    spawnSync(
      "git",
      ["-c", "user.email=wanwu@example.com", "-c", "user.name=Wanwu Cloud", "commit", "-m", "snapshot"],
      { cwd: targetDir },
    );
  }
}

export function verifySnapshotSha256(snapshotPath: string, expected: string): boolean {
  const content = readFileSync(snapshotPath);
  const actual = createHash("sha256").update(content).digest("hex");
  return actual === expected.toLowerCase();
}
