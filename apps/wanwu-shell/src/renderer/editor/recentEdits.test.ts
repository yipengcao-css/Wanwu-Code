import assert from "node:assert/strict";
import { noteRecentEdit, recentEditSummary, resetRecentEdits } from "./recentEdits.ts";

resetRecentEdits();
noteRecentEdit("src/a.ts", "L3 const id = 1");
noteRecentEdit("src/a.ts", "L3 const id = 1");
noteRecentEdit("src/b.ts", "L9 return");
const summary = recentEditSummary();
assert.match(summary, /src\/a\.ts: L3 const id = 1/);
assert.match(summary, /src\/b\.ts: L9 return/);
assert.equal(summary.split("\n").length, 2);
console.log("recentEdits tests passed");
