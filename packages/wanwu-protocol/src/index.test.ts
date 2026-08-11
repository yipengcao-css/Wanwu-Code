import { describe, expect, it } from "vitest";
import { ACP_SCHEMA_VERSION, isWanwuMode } from "./index.js";

describe("wanwu-protocol", () => {
  it("accepts known modes", () => {
    expect(isWanwuMode("plan")).toBe(true);
    expect(isWanwuMode("verify")).toBe(true);
    expect(isWanwuMode("hack")).toBe(false);
  });

  it("exposes a schema version marker", () => {
    expect(ACP_SCHEMA_VERSION.length).toBeGreaterThan(0);
  });
});