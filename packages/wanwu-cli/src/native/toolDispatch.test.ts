import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dispatchTool } from "./toolDispatch.js";

describe("dispatchTool hooks", () => {
  it("blocks tool when PreToolUse hook fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-hooks-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "hooks.toml"),
      `[[hooks]]\nevent = "PreToolUse"\ncommand = "exit 1"\n`,
      "utf8",
    );
    writeFileSync(join(root, "README.md"), "# hi\n", "utf8");

    const result = await dispatchTool(
      {
        workspaceRoot: root,
        sessionId: "s1",
        permissionMode: "ask",
        mode: "ask",
      },
      "ask",
      "Read",
      JSON.stringify({ path: "README.md" }),
    );

    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/PreToolUse/);
  });

  it("runs tool when no hooks configured", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-nohooks-"));
    writeFileSync(join(root, "a.txt"), "hello", "utf8");
    const result = await dispatchTool(
      {
        workspaceRoot: root,
        sessionId: "s1",
        permissionMode: "ask",
        mode: "ask",
      },
      "ask",
      "Read",
      JSON.stringify({ path: "a.txt" }),
    );
    expect(result.ok).toBe(true);
    expect(result.text).toContain("hello");
  });
});
