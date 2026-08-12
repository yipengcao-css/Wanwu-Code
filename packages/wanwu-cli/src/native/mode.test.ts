import { describe, expect, it } from "vitest";
import { detectMode, stripModeTags } from "./mode.js";

describe("mode helpers", () => {
  it("detects mode tags", () => {
    expect(detectMode("[MODE=plan] do x", "agent")).toBe("plan");
    expect(detectMode("[MODE=verify] check", "agent")).toBe("verify");
    expect(detectMode("plain", "ask")).toBe("ask");
  });

  it("strips mode tags", () => {
    expect(stripModeTags("[MODE=agent] 修测试")).toBe("修测试");
  });
});
