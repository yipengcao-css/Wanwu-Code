import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writePlanArtifact } from "./plan.js";

describe("writePlanArtifact", () => {
  it("writes a plan markdown under .wanwu/plans", () => {
    process.env.WANWU_PLAN_QUIET = "1";
    const cwd = mkdtempSync(join(tmpdir(), "wanwu-plan-"));
    const path = writePlanArtifact({
      cwd,
      task: "fix login",
      body: "## 任务理解\n修好登录",
      generatedBy: "test/mock",
    });
    const files = readdirSync(join(cwd, ".wanwu", "plans"));
    expect(files.some((f) => f.endsWith(".plan.md"))).toBe(true);
    const body = readFileSync(path, "utf8");
    expect(body).toContain("generated_by: test/mock");
    expect(body).toContain("修好登录");
    expect(body).toContain("按此计划执行");
  });
});
