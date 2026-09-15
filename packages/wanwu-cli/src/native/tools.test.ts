import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyEditBlocks,
  toolBash,
  toolEdit,
  toolGlob,
  toolRead,
  toolWrite,
} from "./tools.js";
import { assertInsideWorkspace, PathSandboxError } from "./workspacePaths.js";

describe("native tools sandbox", () => {
  it("rejects paths outside workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-tool-"));
    expect(() => assertInsideWorkspace(root, "../escape.txt")).toThrow(PathSandboxError);
  });

  it("reads files inside workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-tool-"));
    writeFileSync(join(root, "hello.md"), "# Hi\n");
    const r = toolRead(root, "hello.md");
    expect(r.ok).toBe(true);
    expect(r.text).toContain("# Hi");
  });

  it("globs markdown files", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-tool-"));
    writeFileSync(join(root, "a.md"), "a");
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "b.md"), "b");
    const g = toolGlob(root, "**/*.md");
    expect(g.text).toMatch(/a\.md/);
  });

  it("blocks dangerous bash", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-tool-"));
    const b = toolBash(root, "cat ~/.ssh/id_rsa", "ask");
    expect(b.ok).toBe(false);
    expect(b.text).toMatch(/Blocked by permission/);
  });
});

describe("applyEditBlocks", () => {
  it("applies a single block", () => {
    const r = applyEditBlocks("hello world", [{ old_string: "world", new_string: "wanwu" }]);
    expect(r.ok).toBe(true);
    expect(r.after).toBe("hello wanwu");
    expect(r.replacements).toBe(1);
  });

  it("applies multiple blocks sequentially", () => {
    const r = applyEditBlocks("a=1;\nb=2;", [
      { old_string: "a=1", new_string: "a=10" },
      { old_string: "b=2", new_string: "b=20" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.after).toBe("a=10;\nb=20;");
    expect(r.replacements).toBe(2);
  });

  it("replace_all replaces every occurrence", () => {
    const r = applyEditBlocks("foo bar foo", [
      { old_string: "foo", new_string: "baz", replace_all: true },
    ]);
    expect(r.ok).toBe(true);
    expect(r.after).toBe("baz bar baz");
    expect(r.replacements).toBe(2);
  });

  it("fails when old_string is not unique", () => {
    const r = applyEditBlocks("foo bar foo", [{ old_string: "foo", new_string: "baz" }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/2 times/);
  });

  it("fails when old_string is missing, with near-miss hint", () => {
    const content = "line1\nconst answer = 42;\nline3";
    const r = applyEditBlocks(content, [
      { old_string: "const answer = 43;", new_string: "x" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/);
    expect(r.error).toMatch(/Near miss/);
  });

  it("tolerates trailing-whitespace differences", () => {
    const content = "def f():  \n    return 1  \n";
    const r = applyEditBlocks(content, [
      { old_string: "def f():\n    return 1", new_string: "def f():\n    return 2" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.after).toContain("return 2");
  });

  it("rejects empty old_string", () => {
    const r = applyEditBlocks("abc", [{ old_string: "", new_string: "x" }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/empty/);
  });

  it("rejects identical old/new", () => {
    const r = applyEditBlocks("abc", [{ old_string: "b", new_string: "b" }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/identical/);
  });
});

describe("toolEdit / toolWrite", () => {
  it("toolEdit applies blocks to an existing file", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-edit-"));
    writeFileSync(join(root, "a.ts"), "const x = 1;\n", "utf8");
    const r = toolEdit(root, "a.ts", [{ old_string: "const x = 1;", new_string: "const x = 2;" }], {
      apply: true,
    });
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(true);
    expect(readFileSync(join(root, "a.ts"), "utf8")).toContain("const x = 2;");
    expect(r.diff?.before).toContain("const x = 1;");
  });

  it("toolEdit propose-only does not write", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-edit-"));
    writeFileSync(join(root, "a.ts"), "const x = 1;\n", "utf8");
    const r = toolEdit(root, "a.ts", [{ old_string: "const x = 1;", new_string: "const x = 2;" }], {
      apply: false,
    });
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(false);
    expect(readFileSync(join(root, "a.ts"), "utf8")).toContain("const x = 1;");
    expect(r.diff?.after).toContain("const x = 2;");
  });

  it("toolEdit fails on missing file (suggests Write)", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-edit-"));
    const r = toolEdit(root, "nope.ts", [{ old_string: "a", new_string: "b" }], { apply: true });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/use Write/);
  });

  it("toolWrite creates parent dirs and writes", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-write-"));
    const r = toolWrite(root, "deep/dir/new.md", "# new\n", { apply: true });
    expect(r.ok).toBe(true);
    expect(readFileSync(join(root, "deep", "dir", "new.md"), "utf8")).toBe("# new\n");
    expect(r.diff?.before).toBe("");
  });

  it("toolWrite propose-only returns diff without writing", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-write-"));
    const r = toolWrite(root, "n.md", "content", { apply: false });
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(false);
    expect(existsSync(join(root, "n.md"))).toBe(false);
    expect(r.diff?.after).toBe("content");
  });

  it("toolWrite rejects escape paths", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-write-"));
    const r = toolWrite(root, "../escape.txt", "x", { apply: true });
    expect(r.ok).toBe(false);
  });
});
