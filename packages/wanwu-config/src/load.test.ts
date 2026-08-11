import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./index.js";
import { loadWanwuConfig } from "./load.js";

describe("loadWanwuConfig", () => {
  it("loads workspace settings overlay", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-config-"));
    mkdirSync(join(root, ".wanwu"));
    writeFileSync(
      join(root, ".wanwu", "settings.toml"),
      `active_provider = "xai"\nmodel = "grok-4"\nacp_backend = "grok"\n`,
      "utf8",
    );
    const loaded = loadWanwuConfig(root);
    expect(loaded.config.activeProvider).toBe("xai");
    expect(loaded.config.model).toBe("grok-4");
    expect(loaded.config.permissionMode).toBe(DEFAULT_CONFIG.permissionMode);
    expect(loaded.sources.some((s) => s.endsWith("settings.toml"))).toBe(true);
  });
});