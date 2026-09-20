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
});
