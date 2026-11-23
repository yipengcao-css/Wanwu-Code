import assert from "node:assert/strict";
import { isNoOpDiff } from "./diffPaths.ts";

assert.equal(isNoOpDiff({ before: "a", after: "a" }), true);
assert.equal(isNoOpDiff({ before: "a", after: "b" }), false);

console.log("diffPaths/no-op tests passed");
