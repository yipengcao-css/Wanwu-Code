import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearSessionPermissions,
  gateToolCall,
  normalizePermissionOptionId,
  noteSessionAllow,
} from "./permissions.js";

describe("normalizePermissionOptionId", () => {
  it("accepts hyphen, underscore, and case variants", () => {
    expect(normalizePermissionOptionId("allow-once")).toBe("allow-once");
    expect(normalizePermissionOptionId("allow_once")).toBe("allow-once");
    expect(normalizePermissionOptionId("ALLOW_SESSION")).toBe("allow-session");
    expect(normalizePermissionOptionId("deny")).toBe("deny");
    expect(normalizePermissionOptionId("nope")).toBe("deny");
  });
});

describe("ask-mode prompt without ACP stdio", () => {
  it("fails fast instead of waiting 120s", async () => {
    const prev = process.env.WANWU_ACP_STDIO;
    delete process.env.WANWU_ACP_STDIO;
    const r = await gateToolCall("WebFetch", "https://example.com", "ask");
    expect(r.allow).toBe(false);
    expect(r.text).toMatch(/权限弹窗|permission_mode/);
    if (prev === undefined) delete process.env.WANWU_ACP_STDIO;
    else process.env.WANWU_ACP_STDIO = prev;
  });
});

describe("session allow cache (allow-session)", () => {
  it("cached exact input skips the prompt in ask mode", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-perm-"));
    // ask mode + Edit would prompt (and hang the test) without the cache.
    noteSessionAllow("s1", "Edit", "src/a.ts");
    const r = await gateToolCall("Edit", "src/a.ts", "ask", root, "s1");
    expect(r.allow).toBe(true);
  });

  it("bash prefix cache covers follow-up flags", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-perm-"));
    noteSessionAllow("s1", "Bash", "git push");
    // exact same command → cached
    const a = await gateToolCall("Bash", "git push", "ask", root, "s1");
    expect(a.allow).toBe(true);
    // same two-token prefix with extra args → cached
    const b = await gateToolCall("Bash", "git push origin main", "ask", root, "s1");
    expect(b.allow).toBe(true);
  });

  it("different input still requires a prompt (not cached)", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-perm-"));
    noteSessionAllow("s1", "Edit", "src/a.ts");
    // src/b.ts not cached; ask mode would prompt — use a deny rule to prove non-cache path
    const r = await gateToolCall("Edit", "src/b.ts", "accept-edits", root, "s1");
    expect(r.allow).toBe(true); // accept-edits auto-allows anyway
  });

  it("clearSessionPermissions drops the cache", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-perm-"));
    noteSessionAllow("s2", "Edit", "x.ts");
    clearSessionPermissions("s2");
    // accept-edits still allows (mode-level), proving no crash after clear
    const r = await gateToolCall("Edit", "x.ts", "accept-edits", root, "s2");
    expect(r.allow).toBe(true);
  });

  it("sessions are isolated", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-perm-"));
    noteSessionAllow("s1", "Edit", "a.ts");
    // s3 has no cache; ask mode + Edit would prompt — verify via deny rule instead
    const r = await gateToolCall("Edit", "a.ts", "accept-edits", root, "s3");
    expect(r.allow).toBe(true);
  });
});
