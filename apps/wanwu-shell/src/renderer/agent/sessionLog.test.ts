import assert from "node:assert/strict";
import {
  appendStreamText,
  appendThought,
  historyToLog,
  parseDebugWaiting,
  parseTodoToolText,
  splitMessageBlocks,
  summarizeToolDetail,
  thoughtPreview,
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
assert.equal(
  summarizeToolDetail("WebSearch", JSON.stringify({ query: "Lua 5.1 for loop closure" })),
  "Lua 5.1 for loop closure",
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

let streamed = appendStreamText([], "thought", "先看");
streamed = appendStreamText(streamed, "assistant", "哪个，");
streamed = appendStreamText(streamed, "thought", "文件");
streamed = appendStreamText(streamed, "assistant", "我就开始");
assert.deepEqual(
  streamed.map((item) => (item.kind === "thought" || item.kind === "assistant" ? item.text : "")),
  ["先看文件", "哪个，我就开始"],
);
streamed = upsertToolLog(streamed, { id: "w1", title: "WebSearch", status: "pending", detail: "{}" });
streamed = appendStreamText(streamed, "thought", "再查");
assert.equal(streamed.filter((item) => item.kind === "thought").length, 2);
assert.equal(streamed.at(-1)?.kind === "thought" ? streamed.at(-1)?.text : "", "再查");

const openThink = splitMessageBlocks("<think>还在想");
assert.equal(openThink[0]?.type, "think");
assert.equal(openThink[0]?.type === "think" ? openThink[0].text : "", "还在想");
assert.equal(thoughtPreview("先定位文件，再改循环变量"), "先定位文件，再改循环变量");

console.log("sessionLog tests passed");
