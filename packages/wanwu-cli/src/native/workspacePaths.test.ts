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
