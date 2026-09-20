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

  it("keeps the full toolset in agent mode", () => {
    expect(toolsForMode("agent", WANWU_TOOL_SPECS)).toHaveLength(WANWU_TOOL_SPECS.length);
    expect(hiddenToolsForMode("agent").size).toBe(0);
    expect(isToolAllowedInMode("agent", "Edit")).toBe(true);
    expect(isToolAllowedInMode("ask", "mcp__demo__search")).toBe(true);
  });
});
