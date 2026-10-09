import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileIgnore, loadIgnore } from "./ignore.js";
import { listWorkspaceFiles } from "./tools.js";

describe("wanwuignore", () => {
  it("skips secrets and honors a workspace file", () => {
    const ignore = compileIgnore("node_modules/\n.env\nsecret/**\n!secret/keep.txt\n");
    expect(ignore("node_modules/pkg/index.js", false)).toBe(true);
    expect(ignore(".env", false)).toBe(true);
    expect(ignore("secret/a.txt", false)).toBe(true);
    expect(ignore("src/app.ts", false)).toBe(false);
  });

  it("keeps ignored files out of the workspace walk", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ignore-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "ok.ts"), "export {}\n");
    writeFileSync(join(root, ".env"), "TOKEN=1\n");
    writeFileSync(join(root, ".wanwuignore"), "notes/\n");
    mkdirSync(join(root, "notes"));
    writeFileSync(join(root, "notes", "a.md"), "x\n");
    const files = listWorkspaceFiles(root);
    expect(files).toContain("src/ok.ts");
    expect(files.some((f) => f.endsWith(".env") || f.startsWith("notes/"))).toBe(false);
    expect(loadIgnore(root)("notes/a.md", false)).toBe(true);
  });
});
