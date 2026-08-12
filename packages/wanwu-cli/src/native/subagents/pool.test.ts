import { describe, expect, it } from "vitest";
import { runSubagents } from "./pool.js";
import type { SubagentRunOptions } from "./types.js";

const baseOpts: SubagentRunOptions = {
  parentSessionId: "parent",
  workspaceRoot: "/tmp",
  permissionMode: "ask",
  config: {} as never,
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "done" } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
};

describe("runSubagents", () => {
  it("runs multiple explore subagents and aggregates", async () => {
    const result = await runSubagents(
      [
        { kind: "explore", prompt: "find a", name: "a" },
        { kind: "explore", prompt: "find b", name: "b" },
      ],
      baseOpts,
    );
    expect(result.results).toHaveLength(2);
    expect(result.aggregateText).toContain("a (explore)");
    expect(result.aggregateText).toContain("b (explore)");
  });

  it("returns error result for empty specs", async () => {
    const result = await runSubagents([], baseOpts);
    expect(result.results).toHaveLength(0);
    expect(result.aggregateText).toBe("");
  });
});
