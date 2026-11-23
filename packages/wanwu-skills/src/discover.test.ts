import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSkills } from "./discover.js";

describe("@wanwu/skills discover", () => {
  it("discovers pack directory skills under ~/.wanwu/skill-packs", () => {
    const home = mkdtempSync(join(tmpdir(), "wanwu-pack-home-"));
    const pack = join(home, ".wanwu", "skill-packs", "azure-ops", "AKS");
    mkdirSync(pack, { recursive: true });
    writeFileSync(
      join(pack, "SKILL.md"),
      "---\nname: AKS\ndescription: Azure Kubernetes ops\n---\n\n# AKS\n",
      "utf8",
    );
    const root = mkdtempSync(join(tmpdir(), "wanwu-pack-ws-"));
    const skills = discoverSkills(root, { userHome: home });
    expect(skills.some((s) => s.id === "pack/azure-ops/AKS")).toBe(true);
    expect(skills.find((s) => s.id === "pack/azure-ops/AKS")?.description).toContain("Kubernetes");
  });
});