import assert from "node:assert/strict";
import { buildEditorContext, diagnosticsForActiveFile, formatCursorWindow } from "./editorContext.ts";

const source = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join("\n");
const windowed = formatCursorWindow(source, 40, 2);
assert.equal(windowed.startLine, 16);
assert.equal(windowed.endLine, 64);
assert.match(windowed.text, /^16\|line 16/);
assert.match(windowed.text, /40\|line 40/);
assert.equal(formatCursorWindow("only", 9, 0).column, 1);

const huge = `${"x".repeat(2000)}\n${"y".repeat(2000)}\n${"z".repeat(2000)}`;
assert.ok(formatCursorWindow(huge, 2, 1).text.length <= 3500);

assert.equal(diagnosticsForActiveFile("(no diagnostics)", "a.ts"), "");
assert.equal(
  diagnosticsForActiveFile("a.ts:3:1 error boom\nb.ts:1:1 warning skip\na.ts:4:1 warning hmm", "a.ts"),
  "a.ts:3:1 error boom\na.ts:4:1 warning hmm",
);

const block = buildEditorContext({
  activePath: "src/a.ts",
  openTabs: ["src/a.ts"],
  cursor: { path: "src/a.ts", line: 40, column: 2, startLine: 16, endLine: 64, text: "40|line 40" },
  diagnostics: "src/a.ts:40:2 error boom",
});
assert.match(block, /Cursor: src\/a\.ts:40:2/);
assert.match(block, /Around cursor \(src\/a\.ts:16-64\)/);
assert.match(block, /40\|line 40/);
assert.match(block, /Diagnostics:\nsrc\/a\.ts:40:2 error boom/);

const selected = buildEditorContext({
  activePath: "src/a.ts",
  selection: { path: "src/a.ts", text: "const x = 1", startLine: 10, endLine: 12 },
  cursor: { path: "src/a.ts", line: 10, column: 1, text: "should not appear" },
});
assert.match(selected, /Selection \(src\/a\.ts:10-12\)/);
assert.doesNotMatch(selected, /Around cursor/);
assert.doesNotMatch(selected, /should not appear/);

const stale = buildEditorContext({
  activePath: "src/b.ts",
  cursor: { path: "src/a.ts", line: 4, column: 1, text: "old file" },
});
assert.match(stale, /Active file: src\/b\.ts/);
assert.doesNotMatch(stale, /old file/);
assert.doesNotMatch(stale, /Cursor:/);
console.log("editorContext tests passed");
