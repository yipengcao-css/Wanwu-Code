import assert from "node:assert/strict";
import {
  isTsLike,
  languageIdFor,
  mapSeverity,
  pathToUri,
  toWorkspaceRel,
} from "./uri.ts";

assert.equal(isTsLike("src/a.ts"), true);
assert.equal(isTsLike("x.md"), false);
assert.equal(languageIdFor("a.tsx"), "typescriptreact");
assert.equal(languageIdFor("a.ts"), "typescript");
assert.equal(mapSeverity(1), "error");
assert.equal(mapSeverity(2), "warning");

const uri = pathToUri("/tmp/ws/src/a.ts");
assert.match(uri, /^file:\/\//);
assert.equal(toWorkspaceRel("/tmp/ws", "/tmp/ws/src/a.ts"), "src/a.ts");

console.log("lsp uri tests passed");
