import assert from "node:assert/strict";
import { historyToLog, parseTodoToolText, upsertToolLog } from "./sessionLog.ts";

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

const pending = upsertToolLog([], { id: "t1", title: "Read", status: "pending" });
const done = upsertToolLog(pending, { id: "t1", title: "Read", status: "completed", detail: "ok" });
assert.equal(done.length, 1);
assert.equal(done[0]?.kind, "tool");
if (done[0]?.kind === "tool") assert.equal(done[0].status, "completed");

console.log("sessionLog tests passed");
