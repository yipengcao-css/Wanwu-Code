import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import {
  fileSkillId,
  readMarkdownFile,
  saveSkillFile,
  skillNameFromMarkdown,
  slugSkillName,
  unwrapSkillMarkdown,
} from "./skillFiles.ts";

assert.equal(slugSkillName("  Code Review! "), "Code-Review");
assert.equal(slugSkillName(""), "skill");
assert.equal(
  unwrapSkillMarkdown("```md\n# Hi\n\nDo the thing.\n```"),
  "# Hi\n\nDo the thing.",
);
assert.equal(
  skillNameFromMarkdown("---\nname: review-pr\ndescription: x\n---\n# Review", "fallback"),
  "review-pr",
);

const root = mkdtempSync(join(tmpdir(), "wanwu-skill-files-"));
const pickedPath = join(root, "笔记.md");
writeFileSync(pickedPath, "# 笔记\n先读再改。\n", "utf8");
const picked = readMarkdownFile(pickedPath);
assert.equal(picked.name, "笔记");
assert.equal(picked.summary, "笔记");
assert.equal(picked.id, fileSkillId(pickedPath));
assert.throws(() => readMarkdownFile(join(root, "nope.txt")), /Markdown/);

const saved = saveSkillFile({
  dest: "workspace",
  root,
  name: "review",
  body: "---\nname: review\ndescription: 检查边界\n---\n# Review\n检查边界。\n",
  userHome: join(root, "home"),
});
assert.equal(saved.id, "workspace/review");
assert.match(readFileSync(saved.path, "utf8"), /检查边界/);
const again = saveSkillFile({
  dest: "workspace",
  root,
  name: "review",
  body: "# Review\n第二份。\n",
  userHome: join(root, "home"),
});
assert.equal(again.id, "workspace/review-2");

const userSaved = saveSkillFile({
  dest: "user",
  root: null,
  name: "local",
  body: "# Local\n本机技能。\n",
  userHome: join(root, "home"),
});
assert.equal(userSaved.id, "user/local");
assert.equal(userSaved.path, join(root, "home", ".wanwu", "skills", "local.md"));

console.log("skillFiles tests passed");
