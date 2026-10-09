import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { gitCommit, gitDiff, gitScmStatus, gitStage, safeRepoPath } from "./gitOps.ts";

assert.equal(safeRepoPath("../x"), null);
assert.equal(safeRepoPath("src/a.ts"), "src/a.ts");

const dir = mkdtempSync(join(tmpdir(), "wanwu-scm-"));
execFileSync("git", ["init"], { cwd: dir });
execFileSync("git", ["config", "user.email", "wanwu@local"], { cwd: dir });
execFileSync("git", ["config", "user.name", "Wanwu"], { cwd: dir });
writeFileSync(join(dir, "note.txt"), "hello\n");
const before = gitScmStatus(dir);
assert.equal(before.repo, true);
assert.ok(before.files.some((f) => f.path === "note.txt" && !f.staged));

const staged = gitStage(dir, ["note.txt"], true);
assert.equal(staged.ok, true);
const mid = gitScmStatus(dir);
assert.ok(mid.files.some((f) => f.path === "note.txt" && f.staged));
assert.match(gitDiff(dir, "note.txt"), /hello/);

const committed = gitCommit(dir, "add note");
assert.equal(committed.ok, true, committed.text);
assert.equal(gitScmStatus(dir).files.length, 0);

const plain = mkdtempSync(join(tmpdir(), "wanwu-scm-none-"));
assert.equal(gitScmStatus(plain).repo, false);

console.log("gitOps tests passed");
