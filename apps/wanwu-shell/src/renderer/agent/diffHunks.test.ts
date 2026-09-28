import assert from "node:assert/strict";
import { applyHunkChoices, diffHunks } from "./diffHunks.ts";

const before = "alpha\nbeta\ngamma\n";
const after = "alpha\nBETA\ngamma\nomega\n";
const hunks = diffHunks(before, after);
assert.equal(hunks.length, 2);
assert.equal(hunks[0]?.before.join("\n"), "beta");
assert.equal(hunks[0]?.after.join("\n"), "BETA");
assert.equal(hunks[1]?.after.join("\n"), "omega");

const all: Record<string, boolean> = {};
for (const h of hunks) all[h.id] = true;
assert.equal(applyHunkChoices(before, hunks, all), after);

const none: Record<string, boolean> = {};
for (const h of hunks) none[h.id] = false;
assert.equal(applyHunkChoices(before, hunks, none), before);

const one: Record<string, boolean> = { ...all, [hunks[1]!.id]: false };
assert.equal(applyHunkChoices(before, hunks, one), "alpha\nBETA\ngamma\n");
assert.equal(diffHunks("same\n", "same\n").length, 0);
console.log("diffHunks tests passed");
