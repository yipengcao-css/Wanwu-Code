import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LspSessionManager } from "./sessionManager.js";
import { BUILTIN_LSP_SERVERS } from "./registry.js";

function makeManager(root: string): LspSessionManager {
  return new LspSessionManager({
    workspaceRoot: root,
    onDiagnostics: () => undefined,
  });
}

// optIn builtins are excluded by default
{
  const root = mkdtempSync(join(tmpdir(), "wanwu-lsp-mgr-"));
  const m = makeManager(root);
  const ids = m.listServers().map((s) => s.id);
  assert.ok(ids.includes("typescript"), "typescript builtin present");
  assert.ok(!ids.includes("json"), "optIn json excluded by default");
  assert.ok(!ids.includes("css"), "optIn css excluded by default");
  assert.equal(m.serverForPath("data.json"), undefined);
  console.log("sessionManager optIn default OK");
}

// optIn builtins activate when workspace config defines them
{
  const root = mkdtempSync(join(tmpdir(), "wanwu-lsp-mgr-"));
  mkdirSync(join(root, ".wanwu"), { recursive: true });
  writeFileSync(
    join(root, ".wanwu", "lsp.toml"),
    `[servers.json]\ncommand = "vscode-json-language-server"\nargs = ["--stdio"]\nlanguages = ["json"]\n`,
    "utf8",
  );
  const m = makeManager(root);
  const ids = m.listServers().map((s) => s.id);
  assert.ok(ids.includes("json"), "json enabled via workspace config");
  assert.equal(m.serverForPath("data.json")?.id, "json");
  console.log("sessionManager optIn via config OK");
}

// routing by language
{
  const root = mkdtempSync(join(tmpdir(), "wanwu-lsp-mgr-"));
  const m = makeManager(root);
  assert.equal(m.serverForPath("src/main.rs")?.id, "rust");
  assert.equal(m.serverForPath("app.py")?.id, "python");
  assert.equal(m.serverForPath("main.go")?.id, "go");
  assert.equal(m.serverForPath("a.ts")?.id, "typescript");
  assert.equal(m.serverForPath("README.md"), undefined);
  console.log("sessionManager routing OK");
}

console.log("lsp sessionManager tests passed");
