import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandMentions, parseMentions, resolveMentions } from "./mentions.js";

describe("parseMentions", () => {
  it("parses file mentions", () => {
    const { text, mentions } = parseMentions("看看 @src/app.ts 和 @README.md");
    expect(mentions).toEqual([
      { raw: "@src/app.ts", kind: "file", arg: "src/app.ts" },
      { raw: "@README.md", kind: "file", arg: "README.md" },
    ]);
    expect(text).toBe("看看 src/app.ts 和 README.md");
  });

  it("parses git and special mentions", () => {
    const { mentions } = parseMentions("@git:status @git:diff @terminal @diagnostics @selection @web:react hooks");
    expect(mentions.map((m) => m.kind)).toEqual(["git", "git", "terminal", "diagnostics", "selection", "web"]);
    expect(mentions[5]!.arg).toBe("react");
  });

  it("parses @codebase and @codebase:query", () => {
    const bare = parseMentions("where is auth @codebase");
    expect(bare.mentions).toEqual([{ raw: "@codebase", kind: "codebase", arg: "" }]);
    const q = parseMentions("see @codebase:login handler");
    expect(q.mentions[0]).toEqual({ raw: "@codebase:login", kind: "codebase", arg: "login" });
  });

  it("returns input unchanged without mentions", () => {
    const { text, mentions } = parseMentions("plain prompt");
    expect(mentions).toEqual([]);
    expect(text).toBe("plain prompt");
  });
});

describe("resolveMentions", () => {
  it("resolves file content inside workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-mention-"));
    writeFileSync(join(root, "a.ts"), "export const a = 1;\n", "utf8");
    const out = await resolveMentions(root, [{ raw: "@a.ts", kind: "file", arg: "a.ts" }]);
    expect(out).toContain("[Context @a.ts]");
    expect(out).toContain("export const a = 1;");
  });

  it("lists folders", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-mention-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "x.ts"), "x", "utf8");
    const out = await resolveMentions(root, [{ raw: "@src", kind: "file", arg: "src" }]);
    expect(out).toContain("src/x.ts");
  });

  it("jails escape attempts", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-mention-"));
    const out = await resolveMentions(root, [{ raw: "@../etc", kind: "file", arg: "../etc" }]);
    expect(out).toMatch(/unavailable|outside/i);
  });

  it("degrades gracefully without host providers", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-mention-"));
    const out = await resolveMentions(root, [
      { raw: "@terminal", kind: "terminal", arg: "" },
      { raw: "@diagnostics", kind: "diagnostics", arg: "" },
    ]);
    expect(out).toContain("terminal output unavailable");
    expect(out).toContain("diagnostics unavailable");
  });

  it("uses host providers when given", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-mention-"));
    const out = await resolveMentions(
      root,
      [{ raw: "@web:news", kind: "web", arg: "news" }],
      { webSearch: async (q) => `results for ${q}` },
    );
    expect(out).toContain("results for news");
  });

  it("resolves @codebase via host search", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-mention-"));
    const out = await resolveMentions(
      root,
      [{ raw: "@codebase:auth", kind: "codebase", arg: "auth" }],
      { codebaseSearch: async (q) => `hits for ${q}` },
    );
    expect(out).toContain("hits for auth");
  });
});

describe("expandMentions", () => {
  it("appends context blocks to the prompt", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-mention-"));
    writeFileSync(join(root, "b.md"), "hello", "utf8");
    const r = await expandMentions(root, "read @b.md please");
    expect(r.text).toBe("read b.md please");
    expect(r.context).toContain("hello");
  });

  it("fills a bare @codebase query from the rest of the prompt", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-mention-"));
    const r = await expandMentions(root, "where is the login form @codebase", {
      codebaseSearch: async (q) => q,
    });
    expect(r.mentions[0]?.arg).toBe("where is the login form");
    expect(r.context).toContain("where is the login form");
  });
});
