import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertInsideWorkspace, PathSandboxError } from "./workspacePaths.js";
import { minimalBashEnv } from "./tools.js";

describe("workspacePaths", () => {
  it("allows normal in-workspace paths", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ws-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "a.ts"), "x", "utf8");
    expect(assertInsideWorkspace(root, "src/a.ts")).toContain("src");
  });

  it("rejects .. escape", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ws-"));
    expect(() => assertInsideWorkspace(root, "../outside")).toThrow(PathSandboxError);
  });

  it("allows paths under WANWU_SKILLS_ROOT", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ws-"));
    const pack = mkdtempSync(join(tmpdir(), "wanwu-pack-"));
    mkdirSync(join(pack, "_shared", "scripts"), { recursive: true });
    writeFileSync(join(pack, "_shared", "scripts", "q.py"), "print(1)", "utf8");
    const prev = process.env.WANWU_SKILLS_ROOT;
    process.env.WANWU_SKILLS_ROOT = pack;
    try {
      const abs = assertInsideWorkspace(root, join(pack, "_shared", "scripts", "q.py"));
      expect(abs).toContain("q.py");
    } finally {
      if (prev === undefined) delete process.env.WANWU_SKILLS_ROOT;
      else process.env.WANWU_SKILLS_ROOT = prev;
    }
  });

  it("rejects symlink escape", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-ws-"));
    const outside = mkdtempSync(join(tmpdir(), "wanwu-out-"));
    writeFileSync(join(outside, "secret.txt"), "secret", "utf8");
    symlinkSync(outside, join(root, "link"), "dir");
    expect(() => assertInsideWorkspace(root, "link/secret.txt")).toThrow(PathSandboxError);
  });
});

describe("minimalBashEnv", () => {
  it("strips API keys and tokens", () => {
    const env = minimalBashEnv({
      PATH: "/usr/bin",
      OPENAI_API_KEY: "sk-x",
      ANTHROPIC_API_KEY: "sk-y",
      MY_TOKEN: "t",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);
    expect(env.PATH).toBe("/usr/bin");
    expect(env.NODE_ENV).toBe("test");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.MY_TOKEN).toBeUndefined();
  });
});
