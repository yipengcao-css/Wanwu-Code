import assert from "node:assert/strict";
import {
  appendThought,
  historyToLog,
  parseDebugWaiting,
  parseTodoToolText,
  splitMessageBlocks,
  summarizeToolDetail,
  upsertToolLog,
} from "./sessionLog.ts";

const log = historyToLog([
  { role: "user", content: "[MODE=agent]\n[EDITOR_CONTEXT]\nActive file: a.ts\n[/EDITOR_CONTEXT]\nfix login" },
  { role: "assistant", content: "looking" },
  { role: "tool", name: "Read", content: "1|ok" },
]);
assert.equal(log[0]?.kind, "status");
assert.deepEqual(
  log.filter((i) => i.kind !== "status"),
  [
    { kind: "user", text: "fix login" },
    { kind: "assistant", text: "looking" },
    { kind: "tool", title: "Read", status: "completed", detail: "1|ok" },
  ],
);

const todos = parseTodoToolText("1/2 completed\n● read files\n◐ write patch");
assert.deepEqual(todos, [
  { status: "completed", content: "read files" },
  { status: "in_progress", content: "write patch" },
]);
assert.equal(parseTodoToolText("not a todo"), null);
assert.equal(parseDebugWaiting("Debug", "phase=wait_for_repro\nWAIT_FOR_REPRO"), true);
assert.equal(parseDebugWaiting("Debug", "phase=cleanup"), false);
assert.equal(parseDebugWaiting("Todo", "WAIT_FOR_REPRO"), null);

const pending = upsertToolLog([], { id: "t1", title: "Read", status: "pending" });
const done = upsertToolLog(pending, { id: "t1", title: "Read", status: "completed", detail: "ok" });
assert.equal(done.length, 1);
assert.equal(done[0]?.kind, "tool");
if (done[0]?.kind === "tool") assert.equal(done[0].status, "completed");

assert.equal(
  summarizeToolDetail("Read", JSON.stringify({ path: "src/a.ts" })),
  "src/a.ts",
);
assert.match(summarizeToolDetail("Read", "1|# title\n2|code\n3|more\n4|x\n5|y"), /行/);

const blocks = splitMessageBlocks(
  "<think>先读文件</think>\n修好了。\n```ts\nconst x = 1\nconst y = 2\n```",
);
assert.deepEqual(
  blocks.map((b) => b.type),
  ["think", "text", "code"],
);
assert.equal(blocks[0]?.type === "think" ? blocks[0].text : "", "先读文件");

const thought = appendThought([], "a");
assert.deepEqual(appendThought(thought, "b"), [{ kind: "thought", text: "ab" }]);

console.log("sessionLog tests passed");
