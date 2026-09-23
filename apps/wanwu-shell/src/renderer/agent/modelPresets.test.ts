import assert from "node:assert/strict";
import { modelsForProvider } from "./modelPresets.ts";

assert.deepEqual(modelsForProvider("openai", "gpt-5"), ["gpt-5", "deepseek-chat"]);
assert.deepEqual(modelsForProvider("openai", "my-proxy-model"), [
  "my-proxy-model",
  "gpt-5",
  "deepseek-chat",
]);
assert.deepEqual(modelsForProvider("xai", ""), ["grok-4"]);
assert.deepEqual(modelsForProvider("unknown", "local"), ["local"]);

console.log("modelPresets tests passed");
