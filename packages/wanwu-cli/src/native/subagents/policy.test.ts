import { describe, expect, it } from "vitest";
import { isBashAllowedForKind, isToolAllowed, policyFor } from "./policy.js";

describe("subagent policy", () => {
  it("explore is read-only", () => {
    const p = policyFor("explore");
    expect(p.mode).toBe("ask");
    expect(isToolAllowed("explore", "Read")).toBe(true);
    expect(isToolAllowed("explore", "Edit")).toBe(false);
    expect(isBashAllowedForKind("explore", "ls -la")).toBe(true);
    expect(isBashAllowedForKind("explore", "rm -rf x")).toBe(false);
  });

  it("plan cannot edit", () => {
    const p = policyFor("plan");
    expect(p.mode).toBe("plan");
    expect(isToolAllowed("plan", "Edit")).toBe(false);
  });

  it("coder can edit", () => {
    const p = policyFor("coder");
    expect(p.mode).toBe("agent");
    expect(isToolAllowed("coder", "Edit")).toBe(true);
  });
});
