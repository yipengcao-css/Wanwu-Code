import assert from "node:assert/strict";
import {
  hasLspMapping,
  languageIdFor,
  mapSeverity,
  pathToUri,
  toWorkspaceRel,
} from "./uri.ts";

assert.equal(languageIdFor("src/a.ts"), "typescript");
assert.equal(languageIdFor("src/a.tsx"), "typescriptreact");
assert.equal(languageIdFor("src/a.js"), "javascript");
assert.equal(languageIdFor("src/a.rs"), "rust");
assert.equal(languageIdFor("src/a.py"), "python");
assert.equal(languageIdFor("src/a.go"), "go");
assert.equal(languageIdFor("src/a.cpp"), "cpp");
assert.equal(languageIdFor("src/a.json"), "json");
assert.equal(languageIdFor("README.md"), "plaintext");

assert.equal(hasLspMapping("a.ts"), true);
assert.equal(hasLspMapping("a.rs"), true);
assert.equal(hasLspMapping("a.md"), false);

assert.equal(mapSeverity(1), "error");
assert.equal(mapSeverity(2), "warning");

const uri = pathToUri("/tmp/ws/src/a.ts");
assert.match(uri, /^file:\/\//);
assert.equal(toWorkspaceRel("/tmp/ws", "/tmp/ws/src/a.ts"), "src/a.ts");

console.log("lsp uri tests passed");
