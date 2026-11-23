import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  gitBlameLine,
  gitBranch,
  gitCommit,
  gitDiff,
  gitDiscard,
  gitDiscardAll,
  gitFileLog,
  gitFileSides,
  gitPull,
  gitPush,
  gitScmStatus,
  gitStage,
  gitStageAll,
  gitStageHunk,
  gitUnstagedHunks,
  safeRepoPath,
} from "./gitOps.ts";

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

writeFileSync(join(dir, "note.txt"), "changed\n");
const sides = gitFileSides(dir, "note.txt");
assert.match(sides.original, /hello/);
assert.match(sides.modified, /changed/);
assert.equal(sides.untracked, false);
const discarded = gitDiscard(dir, "note.txt");
assert.equal(discarded.ok, true, discarded.text);
assert.match(readFileSync(join(dir, "note.txt"), "utf8"), /^hello/);

writeFileSync(join(dir, "extra.txt"), "temp\n");
assert.equal(gitDiscard(dir, "extra.txt").ok, true);
assert.equal(existsSync(join(dir, "extra.txt")), false);
assert.match(gitDiscard(dir, "note.txt").text, /没有可放弃/);

writeFileSync(join(dir, "note.txt"), "hello\n");
const body = ["top", ...Array.from({ length: 12 }, () => "keep"), "bottom", ""].join("\n");
writeFileSync(join(dir, "wide.txt"), body);
assert.equal(gitStage(dir, ["wide.txt"], true).ok, true);
assert.equal(gitCommit(dir, "add wide").ok, true);
const changed = body.replace("top", "TOP").replace("bottom", "BOTTOM");
writeFileSync(join(dir, "wide.txt"), changed);
const hunks = gitUnstagedHunks(dir, "wide.txt");
assert.equal(hunks.hunks.length, 2, hunks.note);
assert.equal(gitStageHunk(dir, "wide.txt", 0).ok, true);
const cached = execFileSync("git", ["diff", "--cached", "--", "wide.txt"], { cwd: dir, encoding: "utf8" });
const unstaged = execFileSync("git", ["diff", "--", "wide.txt"], { cwd: dir, encoding: "utf8" });
assert.match(cached, /TOP/);
assert.match(unstaged, /BOTTOM/);
assert.equal(gitUnstagedHunks(dir, "wide.txt").hunks.length, 1);
assert.match(gitUnstagedHunks(dir, "missing-file.txt").note, /没有未暂存/);

writeFileSync(join(dir, "one.txt"), "1\n");
writeFileSync(join(dir, "two.txt"), "2\n");
assert.equal(gitStageAll(dir).ok, true);
const all = gitScmStatus(dir);
assert.ok(all.files.filter((f) => f.path === "one.txt" || f.path === "two.txt").every((f) => f.staged));
assert.equal(gitDiscardAll(dir).ok, true, gitDiscardAll(dir).text);
assert.equal(existsSync(join(dir, "one.txt")), false);
assert.equal(existsSync(join(dir, "two.txt")), false);
assert.match(gitDiscardAll(dir).text, /没有可放弃/);
assert.equal(gitPush(dir).ok, false);
assert.equal(gitPull(dir).ok, false);

const plain = mkdtempSync(join(tmpdir(), "wanwu-scm-none-"));
assert.equal(gitScmStatus(plain).repo, false);

console.log("gitOps tests passed");
