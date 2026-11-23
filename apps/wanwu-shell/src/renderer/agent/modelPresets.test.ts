import assert from "node:assert/strict";
import { modelsForProvider } from "./modelPresets.ts";

assert.deepEqual(modelsForProvider("openai", ""), []);
assert.deepEqual(modelsForProvider("openai", "my-proxy-model"), ["my-proxy-model"]);
assert.deepEqual(modelsForProvider("xai", ""), []);
assert.deepEqual(modelsForProvider("unknown", "local"), ["local"]);

console.log("modelPresets tests passed");
