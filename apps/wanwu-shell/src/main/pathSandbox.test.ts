import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isInsideRoot, resolveInsideRoot } from "./pathSandbox.js";

const root = "/tmp/wanwu-ws";

assert.equal(resolveInsideRoot(root, "src/a.ts"), path.resolve(root, "src/a.ts"));
assert.equal(isInsideRoot(root, "../etc/passwd"), false);
assert.throws(() => resolveInsideRoot(root, "../etc/passwd"));

// Symlink-aware: a symlink inside the workspace pointing outside is rejected.
const base = mkdtempSync(path.join(tmpdir(), "wanwu-sbx-"));
const ws = path.join(base, "ws");
const outside = path.join(base, "outside");
mkdirSync(ws);
mkdirSync(outside);
writeFileSync(path.join(outside, "secret.txt"), "secret\n");
symlinkSync(outside, path.join(ws, "link"), "dir");
assert.equal(isInsideRoot(ws, "link/secret.txt"), false);
assert.throws(() => resolveInsideRoot(ws, "link/secret.txt"));
assert.equal(isInsideRoot(ws, "real.txt"), true); // normal path still allowed

console.log("pathSandbox tests passed");
