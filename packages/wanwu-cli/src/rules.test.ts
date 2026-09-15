import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverRules, renderRulesForPrompt, ruleMatchesFiles } from "./rules.js";

function writeRule(root: string, name: string, content: string): void {
  const dir = join(root, ".wanwu", "rules");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content, "utf8");
}

describe("rules discovery", () => {
  it("discovers workspace rules with frontmatter", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-rules-"));
    writeRule(
      root,
      "react.md",
      `---\ndescription: React hooks rules\nglobs: src/**/*.tsx, **/*.jsx\n---\nUse hooks properly.\n`,
    );
    const rules = discoverRules(root);
    const react = rules.find((r) => r.name === "react");
    expect(react).toBeDefined();
    expect(react!.scope).toBe("workspace");
    expect(react!.description).toBe("React hooks rules");
    expect(react!.globs).toEqual(["src/**/*.tsx", "**/*.jsx"]);
    expect(react!.alwaysApply).toBe(false);
    expect(react!.body).toBe("Use hooks properly.");
  });

  it("alwaysApply flag parses", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-rules-"));
    writeRule(root, "style.md", `---\nalwaysApply: true\n---\nNo semicolons.\n`);
    const rules = discoverRules(root);
    expect(rules.find((r) => r.name === "style")!.alwaysApply).toBe(true);
  });

  it("rules without frontmatter still load", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-rules-"));
    writeRule(root, "plain.md", "Just do it.\n");
    const rules = discoverRules(root);
    const plain = rules.find((r) => r.name === "plain");
    expect(plain!.body).toBe("Just do it.");
    expect(plain!.globs).toEqual([]);
  });
});

describe("ruleMatchesFiles", () => {
  it("always rules match regardless", () => {
    const r = ruleMatchesFiles(
      { name: "a", path: "", scope: "workspace", globs: [], alwaysApply: true, body: "" },
      [],
    );
    expect(r).toBe(true);
  });

  it("glob rules match active files", () => {
    const rule = {
      name: "react",
      path: "",
      scope: "workspace" as const,
      globs: ["src/**/*.tsx"],
      alwaysApply: false,
      body: "",
    };
    expect(ruleMatchesFiles(rule, ["src/app/App.tsx"])).toBe(true);
    expect(ruleMatchesFiles(rule, ["src/app/App.ts"])).toBe(false);
    expect(ruleMatchesFiles(rule, [])).toBe(false);
  });
});

describe("renderRulesForPrompt", () => {
  it("renders active rules fully and lists the rest on demand", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-rules-"));
    writeRule(root, "always.md", `---\nalwaysApply: true\n---\nBe terse.`);
    writeRule(root, "react.md", `---\ndescription: UI rules\nglobs: **/*.tsx\n---\nUse hooks.`);
    writeRule(root, "manual.md", `---\ndescription: DB rules\n---\nMigrations first.`);
    const rules = discoverRules(root);
    const out = renderRulesForPrompt(rules, ["src/App.tsx"]);
    expect(out).toContain("Be terse.");
    expect(out).toContain("Use hooks.");
    expect(out).not.toContain("Migrations first.");
    expect(out).toContain("manual");
    expect(out).toContain("DB rules");
  });
});
