import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@wanwu/providers";
import { repairToolTranscript, tailHistory } from "./toolTranscript.js";

describe("repairToolTranscript", () => {
  it("splits duplicate tool-call ids and keeps both results", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "查一下" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call_WebSearch", name: "WebSearch", arguments: '{"query":"lua closure"}' },
          { id: "call_WebSearch", name: "WebSearch", arguments: '{"query":"for loop"}' },
        ],
      },
      { role: "tool", toolCallId: "call_WebSearch", name: "WebSearch", content: "first" },
      { role: "tool", toolCallId: "call_WebSearch", name: "WebSearch", content: "second" },
      { role: "assistant", content: "结论" },
    ];
    const fixed = repairToolTranscript(messages);
    const calls = fixed[1]?.toolCalls ?? [];
    expect(new Set(calls.map((c) => c.id)).size).toBe(2);
    const tools = fixed.filter((m) => m.role === "tool");
    expect(tools.map((m) => m.content)).toEqual(["first", "second"]);
    expect(tools.map((m) => m.toolCallId)).toEqual(calls.map((c) => c.id));
    expect(fixed.at(-1)?.content).toBe("结论");
  });

  it("drops a tool message that has no preceding tool_calls", () => {
    const fixed = repairToolTranscript([
      { role: "tool", toolCallId: "orphan", name: "WebSearch", content: "nope" },
      { role: "user", content: "继续" },
    ]);
    expect(fixed.map((m) => m.role)).toEqual(["user"]);
  });

  it("tails history on a user turn", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "old" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "t1", name: "Read", arguments: "{}" }],
      },
      { role: "tool", toolCallId: "t1", name: "Read", content: "file" },
      { role: "user", content: "new" },
    ];
    const tail = tailHistory(history, 1);
    expect(tail.map((m) => m.role)).toEqual(["user"]);
    expect(tail[0]?.content).toBe("new");
    const wider = tailHistory(history, 2);
    expect(wider[0]?.content).toBe("old");
    expect(wider.some((m) => m.role === "tool")).toBe(true);
  });
});
