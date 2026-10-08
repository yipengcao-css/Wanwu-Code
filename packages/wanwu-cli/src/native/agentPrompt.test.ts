import { describe, expect, it } from "vitest";
import { parseEditorContext } from "./agentPrompt.js";

describe("parseEditorContext", () => {
  it("extracts active file and open tabs", () => {
    const prompt = `[MODE=agent]
[EDITOR_CONTEXT]
Active file: src/a.ts
Open tabs: src/a.ts, src/b.ts, README.md
Preview:
\`\`\`
const x = 1
\`\`\`
[/EDITOR_CONTEXT]
fix the bug`;
    const ctx = parseEditorContext(prompt);
    expect(ctx.activePath).toBe("src/a.ts");
    expect(ctx.openTabs).toEqual(["src/a.ts", "src/b.ts", "README.md"]);
  });

  it("accepts legacy Open file label", () => {
    const ctx = parseEditorContext("[EDITOR_CONTEXT]\nOpen file: foo.ts\n[/EDITOR_CONTEXT]");
    expect(ctx.activePath).toBe("foo.ts");
    expect(ctx.openTabs).toEqual(["foo.ts"]);
  });

  it("returns empty when no block", () => {
    expect(parseEditorContext("hello")).toEqual({ openTabs: [] });
  });

  it("extracts the current selection", () => {
    const ctx = parseEditorContext(`[EDITOR_CONTEXT]
Active file: src/a.ts
Selection (src/a.ts:10-12):
\`\`\`
const x = 1
\`\`\`
[/EDITOR_CONTEXT]`);
    expect(ctx.selection).toEqual({
      path: "src/a.ts",
      startLine: 10,
      endLine: 12,
      text: "const x = 1",
    });
  });

  it("extracts the caret window and active-file diagnostics", () => {
    const ctx = parseEditorContext(`[EDITOR_CONTEXT]
Active file: src/a.ts
Cursor: src/a.ts:40:2
Around cursor (src/a.ts:16-64):
\`\`\`
40|const x = 1
\`\`\`
Diagnostics:
src/a.ts:40:2 error boom
[/EDITOR_CONTEXT]`);
    expect(ctx.cursor).toEqual({
      path: "src/a.ts",
      line: 40,
      column: 2,
      startLine: 16,
      endLine: 64,
      text: "40|const x = 1",
    });
    expect(ctx.diagnostics).toBe("src/a.ts:40:2 error boom");
  });

  it("keeps a drive-letter path on the caret", () => {
    const ctx = parseEditorContext(`[EDITOR_CONTEXT]
Cursor: C:/foo/a.ts:40:3
Around cursor (C:/foo/a.ts:16-64):
\`\`\`
40|const x = 1
\`\`\`
[/EDITOR_CONTEXT]`);
    expect(ctx.cursor).toEqual({
      path: "C:/foo/a.ts",
      line: 40,
      column: 3,
      startLine: 16,
      endLine: 64,
      text: "40|const x = 1",
    });
  });
});
