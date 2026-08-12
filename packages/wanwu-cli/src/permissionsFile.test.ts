import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPermissionsFile, matchPermissionRule } from "./permissionsFile.js";

describe("permissionsFile", () => {
  it("loads rules from .wanwu/permissions.toml", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-perms-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "permissions.toml"),
      `[[rules]]\naction = "deny"\npattern = "Bash rm -rf *"\nreason = "no recursive delete"\n\n[[rules]]\naction = "ask"\npattern = "Bash git push*"\n`,
      "utf8",
    );
    const file = loadPermissionsFile(root);
    expect(file.rules).toHaveLength(2);
    expect(file.rules[0]?.action).toBe("deny");
  });

  it("matches rules by tool + input", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-perms-match-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "permissions.toml"),
      `[[rules]]\naction = "deny"\npattern = "Bash rm -rf *"\n`,
      "utf8",
    );
    const file = loadPermissionsFile(root);
    expect(matchPermissionRule(file, "Bash", "rm -rf ./dist")?.action).toBe("deny");
    expect(matchPermissionRule(file, "Bash", "ls -la")).toBeUndefined();
  });

  it("returns empty when no file", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-perms-none-"));
    expect(loadPermissionsFile(root).rules).toEqual([]);
  });
});
