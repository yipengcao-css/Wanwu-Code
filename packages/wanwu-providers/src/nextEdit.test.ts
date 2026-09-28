import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "@wanwu/config";
import {
  classifyNextEdit,
  parseNextEdit,
  predictNextEdit,
  takeNextLine,
  takeNextWord,
} from "./nextEdit.js";

describe("parseNextEdit", () => {
  it("reads a replace away from the cursor", () => {
    const edit = parseNextEdit(
      '```json\n{"action":"replace","line":40,"column":3,"endLine":40,"endColumn":8,"text":"count"}\n```',
    );
    expect(edit).toMatchObject({ action: "replace", line: 40, column: 3, text: "count" });
  });

  it("keeps a trailing newline in the predicted text", () => {
    const edit = parseNextEdit('{"action":"insert","line":2,"column":1,"endLine":2,"endColumn":1,"text":"return;\\n"}');
    expect(edit?.text).toBe("return;\n");
  });

  it("rejects chatter without json", () => {
    expect(parseNextEdit("sure, here is the edit")).toBeNull();
  });
});

describe("classifyNextEdit", () => {
  const at = { action: "insert" as const, line: 4, column: 2, endLine: 4, endColumn: 2, text: "id" };

  it("is inline only when the edit starts at the cursor", () => {
    expect(classifyNextEdit(at, 4, 2)).toBe("inline");
  });

  it("jumps when the edit is on another line", () => {
    expect(classifyNextEdit({ ...at, line: 12, endLine: 12 }, 4, 2)).toBe("jump");
  });

  it("is none when the model declines", () => {
    expect(classifyNextEdit({ ...at, action: "none", text: "" }, 4, 2)).toBe("none");
  });
});

describe("partial accept", () => {
  it("takes one word and leaves the rest", () => {
    expect(takeNextWord("  foo(bar)")).toEqual({ take: "  foo", rest: "(bar)" });
  });

  it("takes one line including the newline", () => {
    expect(takeNextLine("foo\nbar")).toEqual({ take: "foo\n", rest: "bar" });
  });
});

describe("predictNextEdit", () => {
  it("uses the completion model response", async () => {
    let requested = "";
    const fetchImpl: typeof fetch = async (_url, init) => {
      requested = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: "insert",
                  line: 2,
                  column: 1,
                  endLine: 2,
                  endColumn: 1,
                  text: "return n + 1;",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const config = mergeConfig(DEFAULT_CONFIG, {
      activeProvider: "openai",
      model: "gpt-5",
      providers: {
        ...DEFAULT_CONFIG.providers,
        openai: {
          ...DEFAULT_CONFIG.providers.openai,
          completionModel: "small-tab",
        },
      },
    });
    const r = await predictNextEdit({
      config,
      prefix: "function inc(n) {\n",
      suffix: "\n}",
      cursorLine: 2,
      cursorColumn: 1,
      recentEdits: "L1 renamed add to inc",
      fetchImpl,
      env: { OPENAI_API_KEY: "sk-test" },
    });
    expect(r.model).toBe("small-tab");
    expect(r.mode).toBe("inline");
    expect(r.edit.text).toBe("return n + 1;");
    expect(requested).toContain("small-tab");
    expect(requested).toContain("renamed add");
  });
});
