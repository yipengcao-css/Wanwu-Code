import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSubagent } from "./runner.js";
import type { WanwuConfig } from "@wanwu/config";

const config = {
  activeProvider: "openai",
  model: "fixture",
  permissionMode: "ask",
  sandbox: "off",
  acpBackend: "wanwu-native",
  defaultMode: "agent",
  providers: {},
} as unknown as WanwuConfig;

describe("subagent lifecycle hooks", () => {
  it("fires SubagentStart and SubagentEnd", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-sub-hooks-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    const log = join(root, "hooks.log");
    writeFileSync(
      join(root, ".wanwu", "hooks.toml"),
      [
        "[[hooks]]",
        'event = "SubagentStart"',
        `command = "echo start:$WANWU_SUBAGENT_KIND:$WANWU_SUBAGENT_NAME >> ${log}"`,
        "[[hooks]]",
        'event = "SubagentEnd"',
        `command = "echo end:$WANWU_SUBAGENT_OK >> ${log}"`,
      ].join("\n"),
      "utf8",
    );

    const result = await runSubagent(
      { kind: "plan", prompt: "test plan", name: "p1" },
      {
        parentSessionId: "parent",
        workspaceRoot: root,
        permissionMode: "ask",
        config,
      },
    );
    expect(result.ok).toBe(true);
    const content = readFileSync(log, "utf8");
    expect(content).toContain("start:plan:p1");
    expect(content).toContain("end:true");
  });
});
