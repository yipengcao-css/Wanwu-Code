import { describe, expect, it } from "vitest";
import { canRunToolsInParallel } from "./parallelTools.js";

describe("canRunToolsInParallel", () => {
  it("allows a batch of independent reads", () => {
    expect(canRunToolsInParallel(["Read", "Grep", "ListDir"])).toBe(true);
  });

  it("refuses a single tool or any write/side-effect tool", () => {
    expect(canRunToolsInParallel(["Read"])).toBe(false);
    expect(canRunToolsInParallel(["Read", "Edit"])).toBe(false);
    expect(canRunToolsInParallel(["Bash", "Read"])).toBe(false);
    expect(canRunToolsInParallel(["WebFetch", "Read"])).toBe(false);
  });
});
