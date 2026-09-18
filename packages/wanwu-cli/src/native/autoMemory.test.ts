import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractMemoryNote,
  maybeAutoRemember,
  memorySourcePrompt,
  shouldAutoRemember,
} from "./autoMemory.js";

describe("autoMemory", () => {
  it("ignores ordinary prompts", () => {
    expect(shouldAutoRemember("fix the test")).toBe(false);
    expect(extractMemoryNote("fix the test", "done")).toBeUndefined();
  });

  it("extracts a note when the user asks to remember", () => {
    expect(shouldAutoRemember("记住：测试用 pnpm test")).toBe(true);
    const note = extractMemoryNote("记住：测试用 pnpm test", "好的，以后用 pnpm test 跑测试。");
    expect(note).toMatch(/pnpm test/);
  });

  it("matches English remember", () => {
    expect(shouldAutoRemember("Remember that we use conventional commits")).toBe(true);
  });

  it("strips MODE and editor wrappers", () => {
    const src = memorySourcePrompt(
      "[MODE=agent] 记住用 pnpm\n[EDITOR_CONTEXT]\nOpen file: a.ts\n[/EDITOR_CONTEXT]",
    );
    expect(src).toBe("记住用 pnpm");
    expect(src).not.toMatch(/EDITOR_CONTEXT|MODE=/);
  });

  it("writes WANWU.md Learned when asked", () => {
    const dir = mkdtempSync(join(tmpdir(), "wanwu-auto-mem-"));
    writeFileSync(join(dir, "WANWU.md"), "# WANWU.md\n\n## Notes\n", "utf8");
    const note = maybeAutoRemember(dir, "记住以后都用 pnpm", "好的，以后用 pnpm 安装依赖。");
    expect(note).toMatch(/pnpm/);
    const body = readFileSync(join(dir, "WANWU.md"), "utf8");
    expect(body).toMatch(/## Learned/);
    expect(body).toMatch(/pnpm/);
  });

  it("honors WANWU_AUTO_MEMORY=0", () => {
    const dir = mkdtempSync(join(tmpdir(), "wanwu-auto-mem-off-"));
    const prev = process.env.WANWU_AUTO_MEMORY;
    process.env.WANWU_AUTO_MEMORY = "0";
    try {
      expect(maybeAutoRemember(dir, "记住用 pnpm", "ok we will use pnpm always")).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.WANWU_AUTO_MEMORY;
      else process.env.WANWU_AUTO_MEMORY = prev;
    }
  });
});
