import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSkills, renderSkillsForPrompt } from "./skills.js";

describe("skills", () => {
  it("discovers .wanwu/skills markdown", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-skills-"));
    mkdirSync(join(root, ".wanwu", "skills"), { recursive: true });
    writeFileSync(join(root, ".wanwu", "skills", "review.md"), "# Review\nCheck edge cases.", "utf8");
    writeFileSync(join(root, ".wanwu", "skills", "skip.txt"), "nope", "utf8");
    const skills = discoverSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("review.md");
    expect(skills[0]?.preview).toContain("Review");
  });

  it("renders prompt block", () => {
    const text = renderSkillsForPrompt([
      { name: "a.md", path: "/x", preview: "do a" },
    ]);
    expect(text).toContain("# Skill: a.md");
    expect(text).toContain("do a");
  });

  it("returns empty when no skills dir", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-skills-none-"));
    expect(discoverSkills(root)).toEqual([]);
    expect(renderSkillsForPrompt([])).toBe("");
  });
});
