import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchRegistry, findPlugin, parseRegistryIndex, sha256Hex, verifySha256 } from "./registry.js";

const fixture = {
  schemaVersion: 1,
  plugins: [
    {
      id: "skill.demo",
      name: "Demo Skill",
      kind: "skill",
      version: "1.0.0",
      trust: "official",
      source: { type: "https", url: "https://example.com/skill.md", sha256: "abc" },
    },
    {
      id: "mcp.fs",
      name: "Filesystem",
      kind: "mcp",
      version: "1.0.0",
      trust: "community",
      source: { type: "inline-config" },
      mcp: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "."] },
    },
  ],
};

describe("plugin registry", () => {
  it("parses registry index", () => {
    const index = parseRegistryIndex(JSON.stringify(fixture));
    expect(index.plugins).toHaveLength(2);
  });

  it("finds plugin by id and version", () => {
    const index = parseRegistryIndex(JSON.stringify(fixture));
    expect(findPlugin(index, "skill.demo")?.name).toBe("Demo Skill");
    expect(findPlugin(index, "skill.demo", "1.0.0")).toBeDefined();
    expect(findPlugin(index, "skill.demo", "2.0.0")).toBeUndefined();
  });

  it("verifies sha256", () => {
    const text = "hello";
    const hash = sha256Hex(text);
    expect(verifySha256(text, hash)).toBe(true);
    expect(verifySha256(text, "deadbeef")).toBe(false);
    expect(verifySha256(text, undefined)).toBe(true);
  });

  it("fetches file:// registry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wanwu-registry-"));
    const path = join(dir, "index.json");
    writeFileSync(path, JSON.stringify(fixture), "utf8");
    const index = await fetchRegistry(`file://${path}`);
    expect(index.plugins).toHaveLength(2);
  });
});
