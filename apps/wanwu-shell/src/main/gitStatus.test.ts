import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { gitStatus, parseGitPorcelain, scmCodeForPath } from "./gitStatus.ts";

const rows = parseGitPorcelain(" M src/a.ts\nA  src/b.ts\n?? new.md\n");
assert.deepEqual(rows, [
  { path: "src/a.ts", code: "M", raw: " M" },
  { path: "src/b.ts", code: "A", raw: "A " },
  { path: "new.md", code: "?", raw: "??" },
]);

const renamed = parseGitPorcelain("R  old.ts -> src/new.ts\n");
assert.equal(renamed[0]?.path, "src/new.ts");
assert.equal(renamed[0]?.code, "R");

assert.equal(scmCodeForPath("src/a.ts", rows), "M");
assert.equal(scmCodeForPath("src", rows), "dirty");
assert.equal(scmCodeForPath("README.md", rows), undefined);

const dir = mkdtempSync(join(tmpdir(), "wanwu-shell-git-"));
execFileSync("git", ["init"], { cwd: dir });
writeFileSync(join(dir, "tracked-soon.txt"), "x");
mkdirSync(join(dir, "nested"), { recursive: true });
writeFileSync(join(dir, "nested", "u.txt"), "y");
const live = gitStatus(dir);
assert.ok(live.some((e) => e.path === "tracked-soon.txt" && e.code === "?"));
assert.ok(live.some((e) => e.path === "nested/u.txt" && e.code === "?"));

console.log("gitStatus tests passed");
