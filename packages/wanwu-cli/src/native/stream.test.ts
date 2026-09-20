import { describe, expect, it } from "vitest";
import { shouldStream } from "./stream.js";

describe("shouldStream", () => {
  it("defaults to on", () => {
    expect(shouldStream(undefined, {})).toBe(true);
    expect(shouldStream({}, {})).toBe(true);
  });

  it("honors explicit opts.stream over env", () => {
    expect(shouldStream({ stream: false }, { WANWU_STREAM: "1" })).toBe(false);
    expect(shouldStream({ stream: true }, { WANWU_STREAM: "0" })).toBe(true);
  });

  it("opts out via WANWU_STREAM", () => {
    expect(shouldStream(undefined, { WANWU_STREAM: "0" })).toBe(false);
    expect(shouldStream(undefined, { WANWU_STREAM: "false" })).toBe(false);
    expect(shouldStream(undefined, { WANWU_STREAM: "off" })).toBe(false);
    expect(shouldStream(undefined, { WANWU_STREAM: "NO" })).toBe(false);
  });

  it("opts in via WANWU_STREAM", () => {
    expect(shouldStream(undefined, { WANWU_STREAM: "1" })).toBe(true);
    expect(shouldStream(undefined, { WANWU_STREAM: "true" })).toBe(true);
    expect(shouldStream(undefined, { WANWU_STREAM: "on" })).toBe(true);
  });
});
