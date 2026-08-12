import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface SnapshotResult {
  path: string;
  sha256: string;
  bytes: number;
  format: "git-archive-tar-gz" | "tar-gz";
}

const EXCLUDE_PATTERNS = [
  ".env",
  ".env.*",
  "**/credentials*",
  "**/*.pem",
  "**/id_rsa*",
  ".npmrc",
  ".aws",
  ".wanwu/cloud-tasks",
  ".wanwu/sessions",
  "node_modules",
  ".git",
];

/**
 * Create a workspace snapshot for remote upload.
 * Prefers git archive; falls back to tar with excludes.
 */
export function createSnapshot(workspaceRoot: string, outDir: string): SnapshotResult {
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `snapshot-${Date.now()}.tar.gz`);

  // Prefer git archive (tracked files only)
  const git = spawnSync("git", ["archive", "--format=tar.gz", "-o", outPath, "HEAD"], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });

  if (git.status !== 0 || !existsSync(outPath)) {
    // Fallback: tar with excludes
    const args = ["-czf", outPath];
    for (const pat of EXCLUDE_PATTERNS) {
      args.push("--exclude", pat);
    }
    args.push(".");
    const tar = spawnSync("tar", args, { cwd: workspaceRoot, encoding: "utf8" });
    if (tar.status !== 0) {
      throw new Error(`snapshot failed: ${tar.stderr}`);
    }
  }

  const content = readFileSync(outPath);
  const sha256 = createHash("sha256").update(content).digest("hex");
  writeFileSync(`${outPath}.sha256`, sha256, "utf8");

  return {
    path: outPath,
    sha256,
    bytes: content.length,
    format: git.status === 0 ? "git-archive-tar-gz" : "tar-gz",
  };
}

export function validateSnapshotSize(bytes: number, maxBytes = 100 * 1024 * 1024): void {
  if (bytes > maxBytes) {
    throw new Error(`snapshot too large: ${bytes} > ${maxBytes}`);
  }
}
