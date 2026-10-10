import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { gitBlameLine, gitBranch, gitCommit, gitDiff, gitFileLog, gitScmStatus, gitStage, safeRepoPath } from "./gitOps.ts";

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
const added = gitDiff(dir, "note.txt");
assert.match(added, /新文件/);
assert.match(added, /\+hello/);

const tooSoon = gitCommit(dir, "nope");
assert.equal(tooSoon.ok, false);
assert.match(tooSoon.text, /暂存/);

const staged = gitStage(dir, ["note.txt"], true);
assert.equal(staged.ok, true);
const mid = gitScmStatus(dir);
assert.ok(mid.files.some((f) => f.path === "note.txt" && f.staged));
assert.match(gitDiff(dir, "note.txt"), /hello/);

const committed = gitCommit(dir, "add note");
assert.equal(committed.ok, true, committed.text);
assert.equal(gitScmStatus(dir).files.length, 0);
assert.ok(gitBranch(dir).length > 0);
const history = gitFileLog(dir, "note.txt");
assert.equal(history[0]?.subject, "add note");
assert.ok(history[0]?.hash);
const blamed = gitBlameLine(dir, "note.txt", 1);
assert.match(blamed.text, /add note/);
assert.match(blamed.text, new RegExp(history[0]!.hash.slice(0, 7)));
writeFileSync(join(dir, "note.txt"), "hello\nworld\n");
assert.match(gitBlameLine(dir, "note.txt", 2).text, /没有提交/);
assert.equal(gitBlameLine(dir, "note.txt", 0).text, "");
assert.match(gitBlameLine(dir, "../note.txt", 1).text, /^$/);

const plain = mkdtempSync(join(tmpdir(), "wanwu-scm-none-"));
assert.equal(gitScmStatus(plain).repo, false);

console.log("gitOps tests passed");
