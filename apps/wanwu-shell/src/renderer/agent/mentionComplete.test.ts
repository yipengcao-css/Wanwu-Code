import assert from "node:assert/strict";
import {
  applyMention,
  completeMentions,
  mentionTokenAt,
} from "./mentionComplete.ts";

const token = mentionTokenAt("请看 @git:st", 10);
assert.ok(token);
assert.equal(token.partial, "git:st");
assert.equal(token.start, 3);

assert.equal(mentionTokenAt("no mention here", 5), null);
assert.equal(mentionTokenAt("email@x", 7), null);
assert.ok(mentionTokenAt("@", 1));

const files = ["README.md", "src/native/mentions.ts", "apps/wanwu-shell/src/app.tsx"];
const git = completeMentions("git", files);
assert.ok(git.some((s) => s.insert === "@git:status"));
assert.ok(git.every((s) => s.kind === "special" || s.insert.startsWith("@")));

const filesHits = completeMentions("mentions", files);
assert.ok(filesHits.some((s) => s.insert === "@src/native/mentions.ts"));

const readme = completeMentions("READ", files);
assert.ok(readme.some((s) => s.insert === "@README.md"));

const applied = applyMention("请看 @gi", { start: 3, end: 6, partial: "gi" }, "@git:diff");
assert.equal(applied, "请看 @git:diff ");

const web = applyMention("@we", { start: 0, end: 3, partial: "we" }, "@web:");
assert.equal(web, "@web:");

console.log("mentionComplete tests passed");
