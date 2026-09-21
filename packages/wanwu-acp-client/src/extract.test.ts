import assert from "node:assert/strict";
import { extractText, extractThought, extractTool } from "./extract.ts";

const tool = extractText({
  update: {
    sessionUpdate: "tool_call",
    title: "Read",
    status: "completed",
    content: { type: "text", text: "1|# huge file\n2|const x = 1\n" },
  },
});
assert.equal(tool, undefined, "tool dumps must not become chat text");

const thoughtAsText = extractText({
  update: {
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "planning" },
  },
});
assert.equal(thoughtAsText, undefined);

assert.equal(
  extractThought({
    update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "planning" } },
  }),
  "planning",
);

assert.equal(
  extractText({
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hello" } },
  }),
  "hello",
);

const chip = extractTool({
  update: {
    sessionUpdate: "tool_call",
    toolCallId: "t1",
    title: "Read",
    status: "completed",
    content: { type: "text", text: "ok" },
  },
});
assert.equal(chip?.title, "Read");
assert.equal(chip?.detail, "ok");

console.log("acp extract tests passed");
