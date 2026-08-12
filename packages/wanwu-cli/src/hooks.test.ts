import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadHooks, runHooks } from "./hooks.js";

describe("hooks", () => {
  it("loads new lifecycle events from hooks.toml", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-hooks-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "hooks.toml"),
      `[[hooks]]\nevent = "SessionStart"\ncommand = "echo start"\n\n[[hooks]]\nevent = "ToolCallApproved"\ncommand = "echo approved"\n`,
      "utf8",
    );
    const hooks = loadHooks(root);
    expect(hooks).toHaveLength(2);
    expect(hooks.map((h) => h.event)).toContain("SessionStart");
    expect(hooks.map((h) => h.event)).toContain("ToolCallApproved");
  });

  it("runs SessionStart hook with context env", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-hooks-run-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "hooks.toml"),
      `[[hooks]]\nevent = "SessionStart"\ncommand = "echo $WANWU_SESSION_ID"\n`,
      "utf8",
    );
    const result = runHooks(root, "SessionStart", { sessionId: "s1" });
    expect(result.ok).toBe(true);
    expect(result.outputs[0]).toContain("s1");
  });

  it("rejects unknown events", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-hooks-bad-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "hooks.toml"),
      `[[hooks]]\nevent = "UnknownEvent"\ncommand = "echo x"\n`,
      "utf8",
    );
    expect(loadHooks(root)).toHaveLength(0);
  });
});
