import { describe, expect, it } from "vitest";
import { composeFrame } from "./layout.js";

describe("composeFrame", () => {
  it("composes chat + tools + status", () => {
    const lines = composeFrame(
      ["hello", "world"],
      ["tool1", "tool2"],
      "status",
      "prompt",
      { cols: 80, rows: 10 },
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[lines.length - 1]).toBe("prompt");
    expect(lines[lines.length - 2]).toContain("status");
  });

  it("truncates long lines", () => {
    const long = "x".repeat(200);
    const lines = composeFrame([long], [], "status", "prompt", {
      cols: 40,
      rows: 5,
    });
    expect(lines[0]?.length).toBeLessThanOrEqual(41); // 40 + separator
  });
});
