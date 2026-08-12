import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installPlugin } from "./install.js";
import { removePlugin } from "./remove.js";
import { sha256Hex } from "./registry.js";
import type { PluginManifest } from "./types.js";

describe("plugin install/remove", () => {
  it("installs skill into workspace .wanwu/skills", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "wanwu-plugin-ws-"));
    const content = "# Demo Skill\nDo the thing.";
    const manifest: PluginManifest = {
      id: "skill.demo",
      name: "Demo",
      kind: "skill",
      version: "1.0.0",
      trust: "official",
      source: {
        type: "https",
        url: `file://${join(cwd, "fixture.md")}`,
        sha256: sha256Hex(content),
      },
    };
    writeFileSync(join(cwd, "fixture.md"), content, "utf8");

    const record = await installPlugin(manifest, { cwd, scope: "workspace", yes: true });
    expect(record.enabled).toBe(true);
    const installed = readFileSync(join(cwd, ".wanwu", "skills", "skill.demo.md"), "utf8");
    expect(installed).toBe(content);

    expect(removePlugin("skill.demo", { cwd, scope: "workspace" })).toBe(true);
  });

  it("rejects sha256 mismatch", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "wanwu-plugin-bad-"));
    const manifest: PluginManifest = {
      id: "skill.bad",
      name: "Bad",
      kind: "skill",
      version: "1.0.0",
      trust: "official",
      source: {
        type: "https",
        url: `file://${join(cwd, "fixture.md")}`,
        sha256: "deadbeef",
      },
    };
    writeFileSync(join(cwd, "fixture.md"), "content", "utf8");
    await expect(
      installPlugin(manifest, { cwd, scope: "workspace", yes: true }),
    ).rejects.toThrow(/sha256/);
  });

  it("installs mcp config into .wanwu/mcp.toml without spawning", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "wanwu-plugin-mcp-"));
    const manifest: PluginManifest = {
      id: "mcp.fs",
      name: "Filesystem",
      kind: "mcp",
      version: "1.0.0",
      trust: "community",
      source: { type: "inline-config" },
      mcp: { command: "npx", args: ["-y", "server-filesystem", "."] },
    };
    const record = await installPlugin(manifest, { cwd, scope: "workspace", yes: true });
    expect(record.kind).toBe("mcp");
    const text = readFileSync(join(cwd, ".wanwu", "mcp.toml"), "utf8");
    expect(text).toContain("mcp.fs");
    expect(text).toContain("server-filesystem");

    expect(removePlugin("mcp.fs", { cwd, scope: "workspace" })).toBe(true);
    const after = readFileSync(join(cwd, ".wanwu", "mcp.toml"), "utf8");
    expect(after).not.toContain("mcp.fs");
  });
});
