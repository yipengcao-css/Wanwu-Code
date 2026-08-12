import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectVerifySteps } from "./verify.js";

describe("detectVerifySteps", () => {
  it("detects pnpm", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-verify-pnpm-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []", "utf8");
    const steps = detectVerifySteps(root);
    expect(steps[0]?.[0]).toBe("pnpm");
  });

  it("detects cargo", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-verify-cargo-"));
    writeFileSync(join(root, "Cargo.toml"), "[package]\nname = \"x\"", "utf8");
    const steps = detectVerifySteps(root);
    expect(steps[0]?.[0]).toBe("cargo");
  });

  it("detects go", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-verify-go-"));
    writeFileSync(join(root, "go.mod"), "module x", "utf8");
    const steps = detectVerifySteps(root);
    expect(steps[0]?.[0]).toBe("go");
  });

  it("detects python", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-verify-py-"));
    writeFileSync(join(root, "pyproject.toml"), "[project]\nname = \"x\"", "utf8");
    const steps = detectVerifySteps(root);
    expect(steps[0]?.[0]).toBe("python");
  });

  it("falls back for unknown", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-verify-none-"));
    const steps = detectVerifySteps(root);
    expect(steps[0]?.[0]).toBe("echo");
  });
});
