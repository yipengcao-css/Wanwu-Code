import assert from "node:assert/strict";
import { contextEstimate, contextPercent, contextWindowFor, estimateTokens } from "./contextMeter.ts";

assert.equal(estimateTokens("a".repeat(400)), 100);
assert.equal(estimateTokens("汉".repeat(8)), 8);
assert.equal(contextWindowFor("claude-sonnet"), 200_000);
assert.equal(contextWindowFor("gpt-4o"), 128_000);
assert.equal(contextPercent(12800, 128000), 10);
assert.equal(contextPercent(0, 0), 0);
assert.equal(contextEstimate(["a".repeat(400), "b".repeat(400)], 0), 201);
assert.equal(contextEstimate(["a".repeat(400), ""], 500), 500);
assert.equal(contextEstimate([null, undefined], Number.NaN), 0);

console.log("contextMeter tests passed");
