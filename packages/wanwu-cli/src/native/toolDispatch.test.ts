import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WanwuMode } from "@wanwu/config";
import { dispatchTool } from "./toolDispatch.js";
import type { AgentContext } from "./agentLoop.js";

function ctx(root: string): AgentContext {
  return {
    workspaceRoot: root,
    sessionId: "test-session",
    permissionMode: "accept-all",
    mode: "agent",
  };
}

describe("dispatchTool mode enforcement", () => {
  it("blocks mutating Bash in read-only modes (plan/ask/verify)", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-dispatch-"));
    const target = join(root, "written.txt");
    for (const mode of ["plan", "ask", "verify"] as WanwuMode[]) {
      const res = dispatchTool(
        ctx(root),
        mode,
        "Bash",
        JSON.stringify({ command: `echo mutated > ${target}` }),
      );
      expect(res.ok, mode).toBe(false);
      expect(res.text, mode).toMatch(/Bash blocked in mode/);
      expect(existsSync(target), `file should not exist after ${mode}`).toBe(false);
    }
  });

  it("allows read-only Bash in read-only modes", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-dispatch-"));
    const res = dispatchTool(ctx(root), "ask", "Bash", JSON.stringify({ command: "echo hello" }));
    expect(res.ok).toBe(true);
    expect(res.text).toContain("hello");
  });

  it("allows mutating Bash in agent mode (subject to permission policy)", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-dispatch-"));
    const target = join(root, "agent-written.txt");
    const res = dispatchTool(
      ctx(root),
      "agent",
      "Bash",
      JSON.stringify({ command: `echo mutated > ${target}` }),
    );
    expect(res.ok).toBe(true);
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf8")).toContain("mutated");
  });

  it("blocks Edit in read-only modes", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-dispatch-"));
    const res = dispatchTool(
      ctx(root),
      "plan",
      "Edit",
      JSON.stringify({ path: "x.txt", content: "hi" }),
    );
    expect(res.ok).toBe(false);
    expect(res.text).toMatch(/Edit blocked/);
    expect(existsSync(join(root, "x.txt"))).toBe(false);
  });
});
