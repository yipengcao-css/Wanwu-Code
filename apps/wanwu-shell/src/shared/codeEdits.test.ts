import assert from "node:assert/strict";
import { collectWorkspaceEdits } from "./codeEdits.ts";

const files = collectWorkspaceEdits(
  {
    changes: {
      "file:///tmp/demo/src/a.ts": [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "import x;\n" },
      ],
      "file:///tmp/other/nope.ts": [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "no" },
      ],
    },
    documentChanges: [
      {
        textDocument: { uri: "file:///tmp/demo/src/a.ts" },
        edits: [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } }, newText: "y" }],
      },
    ],
  },
  "/tmp/demo",
);

assert.equal(files.length, 1);
assert.equal(files[0]?.rel, "src/a.ts");
assert.equal(files[0]?.edits.length, 2);
assert.deepEqual(collectWorkspaceEdits(null, "/tmp/demo"), []);

console.log("codeEdits tests passed");
