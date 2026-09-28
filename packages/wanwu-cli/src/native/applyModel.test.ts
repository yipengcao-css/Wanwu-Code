import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "@wanwu/config";
import { materializeEdit, parseApplyHunks, resolveApplyModel } from "./applyModel.js";

describe("parseApplyHunks", () => {
  it("reads exact hunks", () => {
    const blocks = parseApplyHunks("@@OLD\nconst n = 1\n@@NEW\nconst n = 2\n@@END");
    expect(blocks).toEqual([{ old_string: "const n = 1", new_string: "const n = 2" }]);
  });
});

describe("materializeEdit", () => {
  it("keeps an exact sketch and does not call the model", async () => {
    let calls = 0;
    const r = await materializeEdit({
      path: "a.ts",
      original: "const n = 1\n",
      intent: "increment",
      sketch: [{ old_string: "const n = 1", new_string: "const n = 2" }],
      complete: async () => {
        calls += 1;
        return "";
      },
    });
    expect(calls).toBe(0);
    expect(r.ok && r.blocks[0]?.new_string).toBe("const n = 2");
  });

  it("asks the apply model when the sketch does not match", async () => {
    const r = await materializeEdit({
      path: "a.ts",
      original: "export const n = 1\n",
      intent: "set n to 2",
      sketch: [{ old_string: "const value = 1", new_string: "const value = 2" }],
      complete: async () => "@@OLD\nexport const n = 1\n@@NEW\nexport const n = 2\n@@END",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.blocks[0]?.old_string).toBe("export const n = 1");
  });
});

describe("resolveApplyModel", () => {
  it("prefers applyModel over the chat model", () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "openai",
      providers: {
        openai: { applyModel: "apply-small", completionModel: "tab-small" },
      },
    });
    expect(resolveApplyModel(config)).toBe("apply-small");
  });
});
