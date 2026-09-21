import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listWorkspaceSkills } from "./skillsList.ts";

const root = mkdtempSync(join(tmpdir(), "wanwu-shell-skills-"));
mkdirSync(join(root, ".wanwu", "skills"), { recursive: true });
writeFileSync(join(root, ".wanwu", "skills", "review.md"), "# Review\nCheck edges.", "utf8");
mkdirSync(join(root, ".agents", "skills", "frontend-design"), { recursive: true });
writeFileSync(join(root, ".agents", "skills", "frontend-design", "SKILL.md"), "# UI\nRestraint.", "utf8");

const list = listWorkspaceSkills(root);
assert.ok(list.some((s) => s.id === "workspace/review"));
assert.ok(list.some((s) => s.id === "agents/frontend-design"));
assert.equal(list.find((s) => s.id === "workspace/review")?.summary, "Review");

console.log("shell skills list tests passed");
