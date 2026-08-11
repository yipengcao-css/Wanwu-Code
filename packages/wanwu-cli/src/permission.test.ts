import { describe, expect, it } from "vitest";
import { assessBash, assessToolCall } from "./permission.js";

describe("permission matcher", () => {
  it("hard-denies reading ssh keys", () => {
    const v = assessBash("cat ~/.ssh/id_rsa");
    expect(v.allow).toBe(false);
    expect(v.requiresPrompt).toBe(false);
  });

  it("requires prompt for rm -rf in ask mode", () => {
    const v = assessBash("rm -rf ./dist", "ask");
    expect(v.allow).toBe(false);
    expect(v.requiresPrompt).toBe(true);
    expect(v.risk).toBe("high");
  });

  it("blocks force push", () => {
    const v = assessBash("git push origin main --force");
    expect(v.allow).toBe(false);
  });

  it("allows benign commands", () => {
    const v = assessBash("pnpm test");
    expect(v.allow).toBe(true);
    expect(v.risk).toBe("low");
  });

  it("gates edits in ask mode", () => {
    const v = assessToolCall("Edit", "src/sum.js", "ask");
    expect(v.allow).toBe(false);
    expect(v.requiresPrompt).toBe(true);
  });
});