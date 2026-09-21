import { describe, expect, it } from "vitest";
import { extractText, extractThought, extractTool } from "./extract.js";

describe("acp extract", () => {
  it("does not treat tool dumps as chat text", () => {
    expect(
      extractText({
        update: {
          sessionUpdate: "tool_call",
          title: "Read",
          status: "completed",
          content: { type: "text", text: "1|# huge file\n2|const x = 1\n" },
        },
      }),
    ).toBeUndefined();
  });

  it("keeps thoughts off the answer stream", () => {
    expect(
      extractText({
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "planning" },
        },
      }),
    ).toBeUndefined();
    expect(
      extractThought({
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "planning" },
        },
      }),
    ).toBe("planning");
  });

  it("reads assistant chunks and tool chips", () => {
    expect(
      extractText({
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "hello" },
        },
      }),
    ).toBe("hello");
    const chip = extractTool({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        title: "Read",
        status: "completed",
        content: { type: "text", text: "ok" },
      },
    });
    expect(chip?.title).toBe("Read");
    expect(chip?.detail).toBe("ok");
  });
});
