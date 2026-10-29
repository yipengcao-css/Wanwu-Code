import assert from "node:assert/strict";
import {
  activeMentionPartial,
  applyMentionInsert,
  mergeMentionSuggestions,
} from "./mentionComplete.js";

assert.equal(activeMentionPartial("fix @src/foo", 12), "src/foo");
assert.equal(activeMentionPartial("fix bug", 7), null);

const inserted = applyMentionInsert("see @src/f", 10, "@src/file.ts");
assert.equal(inserted.text, "see @src/file.ts ");
assert.equal(inserted.caret, inserted.text.length);

const merged = mergeMentionSuggestions(["src/a.ts"], ["@git:status"], "git");
assert.ok(merged.some((m) => m === "@git:status"));

console.log("mentionComplete tests passed");
