import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLspServers } from "./loadLspConfig.ts";

const root = mkdtempSync(join(tmpdir(), "wanwu-lsp-cfg-"));
mkdirSync(join(root, ".wanwu"), { recursive: true });
writeFileSync(
  join(root, ".wanwu", "lsp.toml"),
  `[servers.custom]\ncommand = "my-lsp"\nargs = ["--stdio"]\nlanguages = ["python"]\n`,
  "utf8",
);

const { servers, source } = loadLspServers(root);
assert.ok(source?.endsWith("lsp.toml"));
assert.equal(servers.length, 1);
assert.equal(servers[0]?.id, "custom");
assert.equal(servers[0]?.command, "my-lsp");
assert.deepEqual(servers[0]?.languages, ["python"]);

console.log("lsp loadLspConfig tests passed");
