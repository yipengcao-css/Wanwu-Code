import assert from "node:assert/strict";
import { rememberViewed } from "./recentFiles.ts";

assert.deepEqual(rememberViewed([], "a.ts"), ["a.ts"]);
assert.deepEqual(rememberViewed(["a.ts", "b.ts"], "a.ts"), ["a.ts", "b.ts"]);
assert.deepEqual(rememberViewed(["a.ts", "b.ts"], "c.ts"), ["c.ts", "a.ts", "b.ts"]);
assert.deepEqual(rememberViewed(["a.ts"], null), ["a.ts"]);
assert.deepEqual(rememberViewed(["a.ts"], "  "), ["a.ts"]);

const many = ["1", "2", "3", "4", "5", "6", "7", "8"];
assert.deepEqual(rememberViewed(many, "9"), ["9", "1", "2", "3", "4", "5", "6", "7"]);
console.log("recentFiles tests passed");
