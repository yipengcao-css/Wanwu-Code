import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAcpLaunch } from "./acpBridge.js";

describe("resolveAcpLaunch", () => {
  const prevCmd = process.env.WANWU_ACP_COMMAND;
  const prevArgs = process.env.WANWU_GROK_ACP_ARGS;

  beforeEach(() => {
    delete process.env.WANWU_ACP_COMMAND;
    delete process.env.WANWU_GROK_ACP_ARGS;
  });

  afterEach(() => {
    if (prevCmd === undefined) delete process.env.WANWU_ACP_COMMAND;
    else process.env.WANWU_ACP_COMMAND = prevCmd;
    if (prevArgs === undefined) delete process.env.WANWU_GROK_ACP_ARGS;
    else process.env.WANWU_GROK_ACP_ARGS = prevArgs;
  });

  it("defaults to wanwu-native ACP", () => {
    const dir = mkdtempSync(join(tmpdir(), "wanwu-acp-"));
    mkdirSync(join(dir, ".wanwu"), { recursive: true });
    writeFileSync(join(dir, ".wanwu", "settings.toml"), 'acp_backend = "wanwu-native"\n');
    const plan = resolveAcpLaunch(dir);
    expect(plan.backend).toBe("wanwu-native");
    expect(plan.args.join(" ")).toMatch(/acpServer\.(ts|js)/);
  });

  it("uses grok when workspace settings request it", () => {
    const dir = mkdtempSync(join(tmpdir(), "wanwu-acp-grok-"));
    mkdirSync(join(dir, ".wanwu"), { recursive: true });
    writeFileSync(join(dir, ".wanwu", "settings.toml"), 'acp_backend = "grok"\n');
    const plan = resolveAcpLaunch(dir);
    expect(plan.backend).toBe("grok-bridge");
    expect(plan.command).toBe("grok");
  });

  it("honors WANWU_ACP_COMMAND override", () => {
    process.env.WANWU_ACP_COMMAND = "my-agent --stdio";
    const plan = resolveAcpLaunch(process.cwd());
    expect(plan.backend).toBe("env:WANWU_ACP_COMMAND");
    expect(plan.command).toBe("my-agent");
    expect(plan.args).toEqual(["--stdio"]);
  });
});
