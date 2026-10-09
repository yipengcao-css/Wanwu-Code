import assert from "node:assert/strict";
import { readRecentWorkspaces, rememberWorkspace, workspaceLabel } from "./recentWorkspaces.ts";

assert.deepEqual(readRecentWorkspaces(null), []);
assert.deepEqual(readRecentWorkspaces("nope"), []);

const first = rememberWorkspace(null, "/work/app");
const second = rememberWorkspace(first, "/work/other");
const again = rememberWorkspace(second, "/work/app");
assert.deepEqual(readRecentWorkspaces(again), ["/work/app", "/work/other"]);
assert.equal(workspaceLabel("/work/app"), "work/app");
assert.equal(workspaceLabel("C:\\Users\\me\\proj"), "me/proj");

console.log("recentWorkspaces tests passed");
