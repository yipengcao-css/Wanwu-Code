import { describe, expect, it } from "vitest";
import { parseSessionUpdate } from "./sessionSink.js";

describe("parseSessionUpdate", () => {
  it("parses tool_call", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "t1",
          title: "Read",
          status: "completed",
          content: { type: "text", text: "ok" },
        },
      },
    });
    const event = parseSessionUpdate(raw);
    expect(event?.type).toBe("tool");
    if (event?.type === "tool") {
      expect(event.title).toBe("Read");
      expect(event.status).toBe("completed");
    }
  });

  it("parses diff", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "t1",
          title: "Edit",
          status: "pending",
          content: { type: "diff", path: "a.ts", before: "old", after: "new" },
        },
      },
    });
    const event = parseSessionUpdate(raw);
    expect(event?.type).toBe("diff");
    if (event?.type === "diff") {
      expect(event.path).toBe("a.ts");
      expect(event.before).toBe("old");
    }
  });

  it("parses agent_message_chunk", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "hello" },
        },
      },
    });
    const event = parseSessionUpdate(raw);
    expect(event?.type).toBe("text");
    if (event?.type === "text") {
      expect(event.text).toBe("hello");
    }
  });

  it("returns undefined for non-session JSON", () => {
    expect(parseSessionUpdate("{}")).toBeUndefined();
    expect(parseSessionUpdate("not json")).toBeUndefined();
  });
});
