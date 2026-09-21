import { describe, expect, it } from "vitest";
import { WANWU_TOOL_SPECS } from "./toolSpecs.js";
import { hiddenToolsForMode, isToolAllowedInMode, toolsForMode } from "./modeTools.js";

describe("modeTools", () => {
  it("hides write tools and Bash in ask mode", () => {
    const names = toolsForMode("ask", WANWU_TOOL_SPECS).map((t) => t.name);
    expect(names).toContain("Read");
    expect(names).toContain("SearchCodebase");
    expect(names).not.toContain("Edit");
    expect(names).not.toContain("Write");
    expect(names).not.toContain("Task");
    expect(names).not.toContain("Bash");
  });

  it("lets plan explore with read-only Bash but not Edit", () => {
    const names = toolsForMode("plan", WANWU_TOOL_SPECS).map((t) => t.name);
    expect(names).toContain("Read");
    expect(names).toContain("Bash");
    expect(names).toContain("Todo");
    expect(names).not.toContain("Edit");
    expect(names).not.toContain("Write");
    expect(names).not.toContain("Task");
  });

  it("keeps write tools in agent mode but hides Debug", () => {
    const names = toolsForMode("agent", WANWU_TOOL_SPECS).map((t) => t.name);
    expect(names).toContain("Edit");
    expect(names).toContain("Browser");
    expect(names).not.toContain("Debug");
    expect(hiddenToolsForMode("agent")).toEqual(new Set(["Debug"]));
    expect(isToolAllowedInMode("agent", "Edit")).toBe(true);
    expect(isToolAllowedInMode("ask", "mcp__demo__search")).toBe(true);
  });

  it("exposes Debug and writes in debug mode, hides Task", () => {
    const names = toolsForMode("debug", WANWU_TOOL_SPECS).map((t) => t.name);
    expect(names).toContain("Debug");
    expect(names).toContain("Edit");
    expect(names).toContain("Bash");
    expect(names).not.toContain("Task");
  });
});
