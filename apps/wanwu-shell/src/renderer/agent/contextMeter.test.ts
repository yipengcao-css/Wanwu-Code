import assert from "node:assert/strict";
import { contextPercent, contextWindowFor, estimateTokens } from "./contextMeter.ts";

assert.equal(estimateTokens("a".repeat(400)), 100);
assert.equal(estimateTokens("汉".repeat(8)), 8);
assert.equal(contextWindowFor("claude-sonnet"), 200_000);
assert.equal(contextWindowFor("gpt-4o"), 128_000);
assert.equal(contextPercent(12800, 128000), 10);
assert.equal(contextPercent(0, 0), 0);

console.log("contextMeter tests passed");
