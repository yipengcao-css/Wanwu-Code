import assert from "node:assert/strict";
import path from "node:path";
import { isInsideRoot, resolveInsideRoot } from "./pathSandbox.ts";

const root = "/tmp/wanwu-ws";

assert.equal(resolveInsideRoot(root, "src/a.ts"), path.resolve(root, "src/a.ts"));
assert.equal(isInsideRoot(root, "../etc/passwd"), false);
assert.throws(() => resolveInsideRoot(root, "../etc/passwd"));
console.log("pathSandbox tests passed");
