import { describe, expect, it } from "vitest";
import { uniquifyToolCalls } from "./toolCalls.js";

describe("uniquifyToolCalls", () => {
  it("gives two same-named calls different ids", () => {
    const calls = uniquifyToolCalls([
      { id: "call_WebSearch", name: "WebSearch", arguments: '{"query":"a"}' },
      { id: "call_WebSearch", name: "WebSearch", arguments: "" },
    ]);
    expect(calls.map((c) => c.id)).toEqual(["call_WebSearch", "call_1_WebSearch"]);
    expect(calls[1]?.arguments).toBe("{}");
  });
});
