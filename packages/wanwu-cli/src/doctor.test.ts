import { describe, expect, it } from "vitest";
import { runDoctor } from "./doctor.js";

describe("wanwu doctor", () => {
  it("reports multi-provider parity and grok as an underlying backend option", () => {
    const findings = runDoctor(process.cwd());
    const byCode = new Map(findings.map((f) => [f.code, f]));

    // Multi-model parity (red-line #4): all providers present, symmetric config.
    const parity = byCode.get("config.providers");
    expect(parity?.message).toMatch(/anthropic/);
    expect(parity?.message).toMatch(/custom/);
    expect(parity?.message).toMatch(/openai/);
    expect(parity?.message).toMatch(/xai/);

    // Grok Build ACP is surfaced as the underlying backend option (deliverable #4).
    const grok = byCode.get("acp.grok.available") ?? byCode.get("acp.grok");
    expect(grok).toBeDefined();
    expect(grok?.message.toLowerCase()).toMatch(/grok/);

    // Safety defaults are reported.
    expect(byCode.get("safety")?.message).toMatch(/permissionMode=/);
  });
});
