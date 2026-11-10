import assert from "node:assert/strict";
import path from "node:path";
import { diffReviewTitle, languageForPath, resolveEditAbsPath } from "./diffPaths.ts";

assert.equal(languageForPath("src/a.ts"), "typescript");
assert.equal(languageForPath("App.tsx"), "typescriptreact");
assert.equal(languageForPath("x.unknown"), "plaintext");
assert.equal(diffReviewTitle("src/foo.ts"), "foo.ts (Wanwu)");

const abs = resolveEditAbsPath("/ws", "src/a.ts");
assert.equal(abs, path.join("/ws", "src/a.ts"));
assert.equal(resolveEditAbsPath("/ws", "/abs/b.ts"), "/abs/b.ts");

console.log("diffPaths tests passed");
