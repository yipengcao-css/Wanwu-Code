import { describe, expect, it, beforeEach, afterEach } from "vitest";
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

  it("defaults to grok ACP bridge", () => {
    const plan = resolveAcpLaunch(process.cwd());
    expect(plan.backend).toBe("grok-bridge");
    expect(plan.command).toBe("grok");
    expect(plan.args[0]).toBe("acp");
  });

  it("honors WANWU_ACP_COMMAND override", () => {
    process.env.WANWU_ACP_COMMAND = "my-agent --stdio";
    const plan = resolveAcpLaunch(process.cwd());
    expect(plan.backend).toBe("env:WANWU_ACP_COMMAND");
    expect(plan.command).toBe("my-agent");
    expect(plan.args).toEqual(["--stdio"]);
  });
});