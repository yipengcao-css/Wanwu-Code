import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverSkills,
  parseAttachedSkillIds,
  renderSkillsForPrompt,
  resolvePromptSkills,
  selectSkills,
} from "./skills.js";

function seedWorkspace(root: string): void {
  mkdirSync(join(root, ".wanwu", "skills"), { recursive: true });
  writeFileSync(join(root, ".wanwu", "skills", "review.md"), "# Review\nCheck edge cases.", "utf8");
  writeFileSync(join(root, ".wanwu", "skills", "skip.txt"), "nope", "utf8");
  mkdirSync(join(root, ".agents", "skills", "frontend-design"), { recursive: true });
  writeFileSync(
    join(root, ".agents", "skills", "frontend-design", "SKILL.md"),
    "# Frontend\nUse restraint.",
    "utf8",
  );
}

describe("skills", () => {
  it("discovers workspace and .agents skills", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-skills-"));
    seedWorkspace(root);
    const skills = discoverSkills(root, { userHome: join(root, "no-home") });
    expect(skills.map((s) => s.id).sort()).toEqual(["agents/frontend-design", "workspace/review"]);
    expect(skills.find((s) => s.id === "workspace/review")?.summary).toContain("Review");
  });

  it("selects by id or short name", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-skills-sel-"));
    seedWorkspace(root);
    const all = discoverSkills(root, { userHome: join(root, "no-home") });
    expect(selectSkills(all, ["frontend-design", "workspace/review"]).map((s) => s.name)).toEqual([
      "frontend-design",
      "review",
    ]);
  });

  it("parses [SKILLS=] and defaults to workspace-only", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-skills-prompt-"));
    seedWorkspace(root);
    expect(parseAttachedSkillIds("hello")).toBeUndefined();
    expect(parseAttachedSkillIds("[SKILLS=frontend-design]\nhello")).toEqual(["frontend-design"]);
    expect(parseAttachedSkillIds("[SKILLS=]\nhello")).toEqual([]);
    const def = resolvePromptSkills(root, "plain task");
    expect(def.map((s) => s.id)).toEqual(["workspace/review"]);
    const picked = resolvePromptSkills(root, "[SKILLS=frontend-design]\nplain");
    expect(picked.map((s) => s.id)).toEqual(["agents/frontend-design"]);
  });

  it("renders prompt block", () => {
    const text = renderSkillsForPrompt([
      {
        id: "workspace/a",
        name: "a",
        path: "/x",
        source: "workspace",
        preview: "do a",
        summary: "do a",
      },
    ]);
    expect(text).toContain("# Skill: a (workspace/a)");
    expect(text).toContain("do a");
  });

  it("returns empty when no skills dir", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-skills-none-"));
    expect(discoverSkills(root, { userHome: join(root, "no-home") })).toEqual([]);
    expect(renderSkillsForPrompt([])).toBe("");
  });
});
