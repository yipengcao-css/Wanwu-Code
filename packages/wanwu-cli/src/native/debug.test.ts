import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDebugState, toolDebug } from "./debug.js";

describe("toolDebug", () => {
  it("records hypotheses and wait_for_repro", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-debug-"));
    const first = toolDebug(root, "s1", {
      phase: "hypotheses",
      hypotheses: ["null deref in parse", "race on save"],
    });
    expect(first.ok).toBe(true);
    expect(first.text).toContain("1. null deref in parse");

    const wait = toolDebug(root, "s1", { phase: "wait_for_repro" });
    expect(wait.ok).toBe(true);
    expect(wait.text).toContain("WAIT_FOR_REPRO");
    expect(readDebugState(root, "s1")?.waiting).toBe(true);
    expect(readDebugState(root, "s1")?.hypotheses).toHaveLength(2);
  });

  it("rejects unknown phase", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-debug-bad-"));
    const r = toolDebug(root, "s1", { phase: "explode" });
    expect(r.ok).toBe(false);
  });
});
