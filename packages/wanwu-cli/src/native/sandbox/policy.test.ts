import { describe, expect, it } from "vitest";
import { resolveSandboxPolicy } from "./policy.js";

describe("sandbox policy", () => {
  it("off disables enforcement", () => {
    const p = resolveSandboxPolicy("off", "bwrap");
    expect(p.enforce).toBe(false);
  });

  it("workspace with backend enforces", () => {
    const p = resolveSandboxPolicy("workspace", "bwrap");
    expect(p.enforce).toBe(true);
  });

  it("strict without backend fails closed", () => {
    const p = resolveSandboxPolicy("strict", "none");
    expect(p.enforce).toBe(false);
    expect(p.reason).toMatch(/no backend/);
  });

  it("workspace without backend soft-falls back", () => {
    const p = resolveSandboxPolicy("workspace", "none");
    expect(p.enforce).toBe(false);
    expect(p.reason).toMatch(/falling back/);
  });
});
