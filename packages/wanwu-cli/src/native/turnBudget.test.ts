import { describe, expect, it } from "vitest";
import {
  clampTurnBudget,
  formatTurnLimitNotice,
  nextTurnLimit,
  resolveTurnBudget,
  toolRoundSignature,
} from "./turnBudget.js";

describe("resolveTurnBudget", () => {
  it("starts at 40 and can grow to 120", () => {
    expect(resolveTurnBudget(undefined, {})).toEqual({ start: 40, ceiling: 120, step: 20 });
  });

  it("treats an explicit count as a hard cap", () => {
    expect(resolveTurnBudget(4, {})).toEqual({ start: 4, ceiling: 4, step: 0 });
    expect(resolveTurnBudget(undefined, { WANWU_AGENT_MAX_TURNS: "10" })).toEqual({
      start: 10,
      ceiling: 10,
      step: 0,
    });
  });

  it("lets the ceiling env shrink or raise the adaptive range", () => {
    expect(resolveTurnBudget(undefined, { WANWU_AGENT_TURN_CEILING: "80" })).toEqual({
      start: 40,
      ceiling: 80,
      step: 20,
    });
    expect(resolveTurnBudget(undefined, { WANWU_AGENT_TURN_CEILING: "20" })).toEqual({
      start: 20,
      ceiling: 20,
      step: 0,
    });
  });
});

describe("nextTurnLimit", () => {
  const budget = { start: 1, ceiling: 5, step: 2 };

  it("extends while the tool round is new", () => {
    const next = nextTurnLimit({
      turn: 1,
      limit: 1,
      budget,
      signature: "Read\n{}",
      previousSignature: "",
      repeatCount: 0,
    });
    expect(next.extended).toBe(true);
    expect(next.limit).toBe(3);
    expect(next.stalled).toBe(false);
  });

  it("stops extending when the same tool round repeats", () => {
    const once = nextTurnLimit({
      turn: 2,
      limit: 3,
      budget,
      signature: "Read\n{}",
      previousSignature: "Read\n{}",
      repeatCount: 0,
    });
    expect(once.stalled).toBe(false);
    const twice = nextTurnLimit({
      turn: 3,
      limit: 3,
      budget,
      signature: "Read\n{}",
      previousSignature: "Read\n{}",
      repeatCount: once.repeatCount,
    });
    expect(twice.stalled).toBe(true);
    expect(twice.extended).toBe(false);
  });

  it("does not grow a hard cap", () => {
    const next = nextTurnLimit({
      turn: 4,
      limit: 4,
      budget: { start: 4, ceiling: 4, step: 0 },
      signature: "Edit\n{}",
      previousSignature: "",
      repeatCount: 0,
    });
    expect(next.extended).toBe(false);
    expect(next.limit).toBe(4);
  });
});

describe("toolRoundSignature", () => {
  it("ignores call order and json key order", () => {
    const a = toolRoundSignature([
      { name: "Read", arguments: "{\"path\":\"a\",\"limit\":10}" },
      { name: "Grep", arguments: "{\"pattern\":\"x\"}" },
    ]);
    const b = toolRoundSignature([
      { name: "Grep", arguments: "{ \"pattern\" : \"x\" }" },
      { name: "Read", arguments: "{\"limit\":10,\"path\":\"a\"}" },
    ]);
    expect(a).toBe(b);
    expect(toolRoundSignature(undefined)).toBe("");
  });
});

describe("clampTurnBudget", () => {
  const coder = { start: 16, ceiling: 48, step: 8 };

  it("leaves the budget alone when no cap is set", () => {
    expect(clampTurnBudget(coder, {})).toEqual(coder);
  });

  it("keeps a subagent inside a hard cap", () => {
    expect(clampTurnBudget(coder, { WANWU_AGENT_MAX_TURNS: "10" })).toEqual({
      start: 10,
      ceiling: 10,
      step: 0,
    });
    expect(clampTurnBudget(coder, { WANWU_AGENT_MAX_TURNS: "30" })).toEqual({
      start: 16,
      ceiling: 30,
      step: 8,
    });
    expect(clampTurnBudget(coder, { WANWU_AGENT_MAX_TURNS: "10", WANWU_AGENT_TURN_CEILING: "200" })).toEqual({
      start: 10,
      ceiling: 10,
      step: 0,
    });
  });

  it("does not raise a subagent when the ceiling env is higher", () => {
    expect(clampTurnBudget(coder, { WANWU_AGENT_TURN_CEILING: "200" })).toEqual(coder);
    expect(clampTurnBudget(coder, { WANWU_AGENT_TURN_CEILING: "20" })).toEqual({
      start: 16,
      ceiling: 20,
      step: 4,
    });
  });
});

describe("formatTurnLimitNotice", () => {
  it("names the env var that can actually change the stop", () => {
    expect(formatTurnLimitNotice(10, { start: 10, ceiling: 10, step: 0 }, "cp", { WANWU_AGENT_MAX_TURNS: "10" })).toContain(
      "WANWU_AGENT_MAX_TURNS",
    );
    expect(formatTurnLimitNotice(120, { start: 40, ceiling: 120, step: 20 }, "cp", {})).toContain(
      "WANWU_AGENT_TURN_CEILING",
    );
    expect(formatTurnLimitNotice(20, { start: 8, ceiling: 20, step: 8 }, "cp", {})).not.toContain("WANWU_AGENT_");
    expect(
      formatTurnLimitNotice(20, { start: 20, ceiling: 20, step: 0 }, "cp", { WANWU_AGENT_TURN_CEILING: "20" }),
    ).not.toContain("WANWU_AGENT_MAX_TURNS");
  });
});
