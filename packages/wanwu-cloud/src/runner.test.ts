import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { FileCloudClient } from "./client.js";
import { isolatedGitArgs, runCloudTaskLocally } from "./runner.js";

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wanwu-runner-"));
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "wanwu@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Wanwu"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# tmp\n", "utf8");
  spawnSync("git", ["add", "."], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

function installFailingLfsHooks(repo: string): void {
  const hooks = join(repo, ".git", "hooks");
  mkdirSync(hooks, { recursive: true });
  for (const name of ["post-checkout", "pre-commit", "post-commit"]) {
    const hook = join(hooks, name);
    writeFileSync(
      hook,
      `#!/bin/sh\necho "This repository is configured for Git LFS but 'git-lfs' was not found" >&2\nexit 2\n`,
      "utf8",
    );
    chmodSync(hook, 0o755);
  }
}

describe("cloud local runner", () => {
  let root = "";

  afterEach(() => {
    if (root) {
      spawnSync("git", ["worktree", "prune"], { cwd: root });
      rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("prefixes git with an empty hooksPath so LFS hooks cannot abort", () => {
    const args = isolatedGitArgs("/tmp/repo", ["worktree", "add", "x"]);
    expect(args[0]).toBe("-c");
    expect(args[1]).toMatch(/core\.hooksPath=/);
    expect(args).toContain("filter.lfs.required=false");
    expect(args).toContain("worktree");
    expect(args.at(-1)).toBe("x");
  });

  it("succeeds when git-lfs hooks exit 2 (slim Docker image)", { timeout: 20_000 }, async () => {
    root = initRepo();
    installFailingLfsHooks(root);
    const client = new FileCloudClient(root);
    const queued = await client.submit("gha pure docker");
    const done = runCloudTaskLocally({ repoRoot: root, taskId: queued.id });
    expect(done.status).toBe("succeeded");
    expect(done.exitCode).toBe(0);
  });
});
