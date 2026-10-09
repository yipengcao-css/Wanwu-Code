import assert from "node:assert/strict";
import { shouldListEntry } from "./listFilter.ts";

assert.equal(shouldListEntry(".wanwuignore"), true);
assert.equal(shouldListEntry(".gitignore"), true);
assert.equal(shouldListEntry(".env"), true);
assert.equal(shouldListEntry("src"), true);
assert.equal(shouldListEntry(".git"), false);
assert.equal(shouldListEntry(".wanwu"), false);
assert.equal(shouldListEntry("node_modules"), false);
assert.equal(shouldListEntry("."), false);

console.log("listFilter tests passed");
