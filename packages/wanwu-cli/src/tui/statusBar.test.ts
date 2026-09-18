import { describe, expect, it } from "vitest";
import { THEMES } from "./theme.js";
import { formatUsage, renderStatusBar } from "./statusBar.js";

describe("formatUsage", () => {
  it("returns empty when no tokens", () => {
    expect(formatUsage({})).toBe("");
  });

  it("formats in/out/total", () => {
    expect(formatUsage({ inputTokens: 12, outputTokens: 34, totalTokens: 46 })).toBe(
      "in 12 / out 34 / total 46",
    );
  });
});

describe("renderStatusBar", () => {
  it("shows stream=on and token usage", () => {
    const line = renderStatusBar(
      {
        mode: "agent",
        provider: "openai",
        model: "gpt-5",
        llm: true,
        workspace: "/tmp/ws",
        toolsRunning: 0,
        stream: true,
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
      },
      THEMES.mono!,
    );
    expect(line).toContain("stream=on");
    expect(line).toContain("in 100 / out 20 / total 120");
    expect(line).toContain("agent");
  });

  it("shows stream=off when disabled", () => {
    const line = renderStatusBar(
      {
        mode: "ask",
        provider: "openai",
        model: "gpt-5",
        llm: false,
        workspace: "/tmp/ws",
        toolsRunning: 1,
        stream: false,
      },
      THEMES.mono!,
    );
    expect(line).toContain("stream=off");
    expect(line).not.toContain("in ");
  });
});
