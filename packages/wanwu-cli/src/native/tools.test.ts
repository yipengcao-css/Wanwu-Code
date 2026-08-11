import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolBash, toolGlob, toolRead } from "./tools.js";
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
