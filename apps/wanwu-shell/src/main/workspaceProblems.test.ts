import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeDiagnostics, parseCheckerOutput } from "../shared/problems.ts";
import { scanWorkspaceProblems } from "./workspaceProblems.ts";

const cwd = "/work/app";
const parsed = parseCheckerOutput(
  [
    "src/a.ts(3,5): error TS2322: Type 'string' is not assignable.",
    "src/b.ts:4:2 - error TS2304: Cannot find name 'nope'.",
    "src/main.rs:10:5: error[E0425]: cannot find value `foo`",
    "./main.go:8:2: undefined: missing",
    String.raw`/work/app/src/c.ts(1,1): warning TS6133: 'x' is declared but its value is never read.`,
    "node_modules/pkg/index.ts(1,1): error TS1: skip",
    "../outside.ts(1,1): error TS1: skip",
  ].join("\n"),
  cwd,
);

assert.equal(parsed.length, 5);
assert.deepEqual(
  parsed.map((row) => `${row.path}:${row.startLine + 1}:${row.severity}`),
  ["src/a.ts:3:error", "src/b.ts:4:error", "src/main.rs:10:error", "main.go:8:error", "src/c.ts:1:warning"],
);
assert.equal(parsed[0]?.startCharacter, 4);
assert.equal(parsed[2]?.message, "cannot find value `foo`");

const merged = mergeDiagnostics(
  { "a.ts": [{ message: "live" }], "clean.ts": [] },
  { "a.ts": [{ message: "scan" }], "b.ts": [{ message: "far" }], "clean.ts": [{ message: "stale" }] },
);
assert.equal(merged["a.ts"]?.[0]?.message, "live");
assert.equal(merged["b.ts"]?.[0]?.message, "far");
assert.equal(merged["clean.ts"], undefined);

const empty = mkdtempSync(join(tmpdir(), "wanwu-problems-"));
const scan = scanWorkspaceProblems(empty);
assert.equal(scan.available, false);
assert.equal(scan.problems.length, 0);

console.log("workspaceProblems tests passed");
