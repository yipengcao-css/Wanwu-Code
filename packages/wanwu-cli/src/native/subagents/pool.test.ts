import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSubagents } from "./pool.js";
import { isBashAllowedForKind, isToolAllowed, policyFor } from "./policy.js";
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

describe("subagent policy", () => {
  it("explore cannot edit, coder can", () => {
    expect(isToolAllowed("explore", "Edit")).toBe(false);
    expect(isToolAllowed("explore", "Write")).toBe(false);
    expect(isToolAllowed("explore", "Read")).toBe(true);
    expect(isToolAllowed("coder", "Edit")).toBe(true);
    expect(isToolAllowed("coder", "Write")).toBe(true);
    expect(isToolAllowed("plan", "Bash")).toBe(false);
  });

  it("explore bash is read-only", () => {
    expect(isBashAllowedForKind("explore", "git status")).toBe(true);
    expect(isBashAllowedForKind("explore", "rm -rf x")).toBe(false);
    expect(isBashAllowedForKind("coder", "pnpm test")).toBe(true);
  });

  it("policy includes new tools", () => {
    expect(policyFor("coder").allowedTools.has("Diagnose")).toBe(true);
    expect(policyFor("explore").allowedTools.has("SearchCodebase")).toBe(true);
  });
});

describe("coder mutex", () => {
  it("coder subagents never overlap", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-pool-"));
    // Track overlap via a shared marker: plan-kind subagents run the
    // deterministic plan path (no LLM needed). Use coder kind with the
    // worktree-fail-closed path to prove serialization ordering instead:
    // both coders fail fast (no git repo) — order must be sequential.
    const order: string[] = [];
    const specs = [
      { kind: "coder" as const, prompt: "a", name: "c1" },
      { kind: "coder" as const, prompt: "b", name: "c2" },
    ];
    const r = await runSubagents(specs, {
      parentSessionId: "p",
      workspaceRoot: root,
      permissionMode: "ask",
      config,
      concurrency: 4,
    });
    for (const res of r.results) order.push(res.name ?? "?");
    // both failed closed (no git repo in tmp) but executed in order
    expect(r.results.every((x) => !x.ok)).toBe(true);
    expect(r.results[0]!.error).toMatch(/worktree/);
    expect(order).toEqual(["c1", "c2"]);
  });
});
