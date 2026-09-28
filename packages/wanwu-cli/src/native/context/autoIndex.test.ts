import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { saveIndex } from "../codebaseIndex/store.js";
import { autoIndexContext, indexQueryFromPrompt } from "./autoIndex.js";

describe("indexQueryFromPrompt", () => {
  it("drops editor context and keeps the question", () => {
    const q = indexQueryFromPrompt(
      "where is checkSession\n[EDITOR_CONTEXT]\nActive file: secret.ts\n[/EDITOR_CONTEXT]",
      "src/app.ts",
    );
    expect(q).toContain("src/app.ts");
    expect(q).toContain("checkSession");
    expect(q).not.toContain("secret.ts");
  });
});

describe("autoIndexContext", () => {
  it("returns hits from the existing index without a model call", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-auto-index-"));
    mkdirSync(join(root, ".wanwu", "index"), { recursive: true });
    saveIndex(root, {
      version: 1,
      mode: "keyword",
      updatedAt: "t",
      files: {
        "src/auth.ts": {
          mtimeMs: 1,
          size: 10,
          chunks: [
            {
              startLine: 4,
              endLine: 8,
              text: "export function checkSession(token: string) { return token }",
              tokens: ["export", "function", "checksession", "token", "string", "return"],
            },
          ],
        },
      },
    });
    const block = await autoIndexContext(root, "where is checkSession used");
    expect(block).toContain("src/auth.ts:4-8");
    expect(block).toContain("checkSession");
  });

  it("still finds a chunk that was stored without tokens", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-auto-index-"));
    mkdirSync(join(root, ".wanwu", "index"), { recursive: true });
    saveIndex(root, {
      version: 1,
      mode: "keyword",
      updatedAt: "t",
      files: {
        "src/auth.ts": {
          mtimeMs: 1,
          size: 10,
          chunks: [
            {
              startLine: 4,
              endLine: 8,
              text: "export function checkSession(token: string) { return token }",
            },
          ],
        },
      },
    });
    const block = await autoIndexContext(root, "where is checkSession used");
    expect(block).toContain("src/auth.ts:4-8");
    expect(block).not.toContain("Infinity");
  });
});
