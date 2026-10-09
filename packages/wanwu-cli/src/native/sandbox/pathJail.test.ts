import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { outsideWorkspacePaths, runPathJail } from "./pathJail.js";

describe("path jail", () => {
  const root = mkdtempSync(join(tmpdir(), "wanwu-jail-"));

  it("flags paths that leave the workspace", () => {
    expect(outsideWorkspacePaths("cat /etc/passwd", root)).toContain("/etc/passwd");
    expect(outsideWorkspacePaths("type C:\\Windows\\win.ini", root).length).toBeGreaterThan(0);
    expect(outsideWorkspacePaths("cat ../secret.txt", root)).toContain("../secret.txt");
    expect(outsideWorkspacePaths("echo ~/id_rsa", root)).toContain("~/id_rsa");
    expect(outsideWorkspacePaths("echo hello && ls src", root)).toEqual([]);
  });

  it("runs a local command and refuses an outside path", () => {
    const ok = runPathJail({
      workspaceRoot: root,
      command: "echo wanwu-jail",
      mode: "workspace",
      env: process.env,
    });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("wanwu-jail");

    const denied = runPathJail({
      workspaceRoot: root,
      command: "cat /etc/passwd",
      mode: "workspace",
      env: process.env,
    });
    expect(denied.status).toBe(1);
    expect(denied.stderr).toMatch(/outside workspace/);
  });
});
