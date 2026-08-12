import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dispatchTool } from "./toolDispatch.js";

describe("dispatchTool hooks", () => {
  it("blocks tool when PreToolUse hook fails", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-hooks-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "hooks.toml"),
      `[[hooks]]\nevent = "PreToolUse"\ncommand = "exit 1"\n`,
      "utf8",
    );
    writeFileSync(join(root, "README.md"), "# hi\n", "utf8");

    const result = dispatchTool(
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

  it("runs tool when no hooks configured", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-nohooks-"));
    writeFileSync(join(root, "a.txt"), "hello", "utf8");
    const result = dispatchTool(
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

describe("dispatchTool P0 safety", () => {
  it("Edit proposes without writing to disk", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-edit-propose-"));
    writeFileSync(join(root, "a.txt"), "before", "utf8");
    const result = dispatchTool(
      {
        workspaceRoot: root,
        sessionId: "s1",
        permissionMode: "accept-edits",
        mode: "agent",
      },
      "agent",
      "Edit",
      JSON.stringify({ path: "a.txt", content: "after" }),
    );
    expect(result.ok).toBe(true);
    expect(result.diff?.before).toBe("before");
    expect(result.diff?.after).toBe("after");
    expect(readFileSync(join(root, "a.txt"), "utf8")).toBe("before");
  });

  it("Edit is blocked in plan mode", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-edit-plan-"));
    const result = dispatchTool(
      {
        workspaceRoot: root,
        sessionId: "s1",
        permissionMode: "accept-edits",
        mode: "plan",
      },
      "plan",
      "Edit",
      JSON.stringify({ path: "a.txt", content: "x" }),
    );
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/blocked in mode=plan/);
  });

  it("Bash blocked in ask mode for non-readonly commands", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-bash-ask-"));
    const result = dispatchTool(
      {
        workspaceRoot: root,
        sessionId: "s1",
        permissionMode: "ask",
        mode: "ask",
      },
      "ask",
      "Bash",
      JSON.stringify({ command: "rm -rf ./dist" }),
    );
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/blocked in mode=ask/);
  });

  it("Bash allows readonly commands in ask mode", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-bash-ro-"));
    writeFileSync(join(root, "a.txt"), "hello", "utf8");
    const result = dispatchTool(
      {
        workspaceRoot: root,
        sessionId: "s1",
        permissionMode: "ask",
        mode: "ask",
      },
      "ask",
      "Bash",
      JSON.stringify({ command: "cat a.txt" }),
    );
    expect(result.ok).toBe(true);
    expect(result.text).toContain("hello");
  });
});
