import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSystem } from "./llmAgentLoop.js";

describe("buildSystem", () => {
  it("injects project memory and .wanwu/skills SOPs into the system prompt", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-sys-"));
    writeFileSync(join(root, "WANWU.md"), "# Memory\nMEMORY_MARKER_123");
    mkdirSync(join(root, ".wanwu", "skills"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "skills", "azure-tsg.md"),
      "# Azure TSG\nSKILL_MARKER_ABC steps to diagnose NSG",
    );

    const sys = buildSystem(
      { workspaceRoot: root, sessionId: "s1", permissionMode: "ask", mode: "agent" },
      "agent",
    );

    expect(sys).toContain("Project memory:");
    expect(sys).toContain("MEMORY_MARKER_123");
    expect(sys).toContain("Skills (internal SOPs");
    expect(sys).toContain("azure-tsg.md");
    expect(sys).toContain("SKILL_MARKER_ABC");
  });

  it("omits the skills section when there are none", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-sys-empty-"));
    const sys = buildSystem(
      { workspaceRoot: root, sessionId: "s1", permissionMode: "ask", mode: "ask" },
      "ask",
    );
    expect(sys).not.toContain("Skills (internal SOPs");
  });
});
