import { describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectDiagnoseStep, runDiagnose, toolDiagnose } from "./diagnose.js";

/** Link the monorepo's typescript into a temp project so detection uses it. */
function linkLocalTsc(root: string): void {
  const repoRoot = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
  const repoTsPkg = join(repoRoot, "node_modules", "typescript");
  if (!existsSync(join(repoTsPkg, "bin", "tsc"))) return;
  mkdirSync(join(root, "node_modules"), { recursive: true });
  symlinkSync(repoTsPkg, join(root, "node_modules", "typescript"), "dir");
  const binDir = join(root, "node_modules", ".bin");
  mkdirSync(binDir, { recursive: true });
  const launcher = join(binDir, "tsc");
  writeFileSync(
    launcher,
    '#!/bin/sh\nexec node "$(dirname "$0")/../typescript/bin/tsc" "$@"\n',
    "utf8",
  );
  chmodSync(launcher, 0o755);
}

describe("detectDiagnoseStep", () => {
  it("detects tsconfig projects", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-diag-"));
    writeFileSync(join(root, "tsconfig.json"), "{}", "utf8");
    const step = detectDiagnoseStep(root);
    expect(step?.label).toBe("tsc --noEmit");
  });

  it("detects cargo projects", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-diag-"));
    writeFileSync(join(root, "Cargo.toml"), "[package]\nname='x'\n", "utf8");
    expect(detectDiagnoseStep(root)?.label).toBe("cargo check");
  });

  it("returns undefined for unknown projects", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-diag-"));
    expect(detectDiagnoseStep(root)).toBeUndefined();
  });
});

describe("runDiagnose", () => {
  it("reports unavailable for unknown project types", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-diag-"));
    const r = runDiagnose(root);
    expect(r.available).toBe(false);
    expect(r.ok).toBe(true);
  });

  it("runs tsc and surfaces errors", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-diag-"));
    linkLocalTsc(root);
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true, noEmit: true } }),
      "utf8",
    );
    writeFileSync(join(root, "bad.ts"), "const x: number = 'not a number';\n", "utf8");
    const r = runDiagnose(root, { timeoutMs: 60_000 });
    expect(r.available).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/bad.ts/);
  }, 90_000);

  it("passes on clean TS", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-diag-"));
    linkLocalTsc(root);
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true, noEmit: true } }),
      "utf8",
    );
    writeFileSync(join(root, "ok.ts"), "export const x: number = 1;\n", "utf8");
    const r = runDiagnose(root, { timeoutMs: 60_000 });
    expect(r.available).toBe(true);
    expect(r.ok).toBe(true);
  }, 90_000);

  it("toolDiagnose wraps the result", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-diag-"));
    const r = toolDiagnose(root);
    expect(r.ok).toBe(true);
    expect(r.title).toBe("Diagnose");
  });
});
