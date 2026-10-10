import assert from "node:assert/strict";
import { applyLspTextEdits } from "./lspEdits.ts";

const inserted = applyLspTextEdits("const a=1;\n", [
  {
    range: { start: { line: 0, character: 7 }, end: { line: 0, character: 7 } },
    newText: " ",
  },
]);
assert.equal(inserted, "const a =1;\n");

const replaced = applyLspTextEdits("foo\nbar\n", [
  {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
    newText: "qux",
  },
]);
assert.equal(replaced, "qux\nbar\n");

const crlf = applyLspTextEdits("a\r\nb\r\n", [
  {
    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
    newText: "c",
  },
]);
assert.equal(crlf, "a\r\nc\r\n");

console.log("lspEdits tests passed");
