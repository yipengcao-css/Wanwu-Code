import { describe, expect, it } from "vitest";
import { renderDiff } from "./renderDiff.js";

describe("renderDiff", () => {
  it("shows added and removed lines", () => {
    const out = renderDiff("a.ts", "old\nsame", "new\nsame");
    expect(out).toContain("a.ts");
    expect(out).toContain("- old");
    expect(out).toContain("+ new");
    expect(out).toContain("same");
  });

  it("truncates long diffs", () => {
    const before = Array.from({ length: 200 }, (_, i) => `line${i}`).join("\n");
    const after = before.replace("line0", "changed");
    const out = renderDiff("big.ts", before, after);
    expect(out).toContain("truncated");
  });
});
