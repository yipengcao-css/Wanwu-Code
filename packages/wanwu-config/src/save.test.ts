import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const home = mkdtempSync(join(tmpdir(), "wanwu-cfg-"));
vi.stubEnv("HOME", home);
vi.stubEnv("USERPROFILE", home);

const { saveUserConfig, saveUserCredentials, loadUserCredentials } = await import("./save.js");

describe("saveUserConfig / credentials", () => {
  it("writes config.toml without api key", () => {
    const path = saveUserConfig({
      activeProvider: "openai",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
    });
    const text = readFileSync(path, "utf8");
    expect(text).toContain("deepseek-chat");
    expect(text).toContain("api.deepseek.com");
    expect(text).not.toMatch(/sk-/);
  });

  it("stores credentials separately", () => {
    const path = saveUserCredentials({ apiKey: "sk-test-123" }, "openai");
    expect(path.endsWith("credentials.env")).toBe(true);
    const creds = loadUserCredentials();
    expect(creds.OPENAI_API_KEY).toBe("sk-test-123");
  });
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});
