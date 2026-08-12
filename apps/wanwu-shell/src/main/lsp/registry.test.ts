import assert from "node:assert/strict";
import { BUILTIN_LSP_SERVERS, serverForLanguage } from "./registry.ts";

assert.ok(BUILTIN_LSP_SERVERS.length >= 5);
assert.equal(serverForLanguage("typescript")?.id, "typescript");
assert.equal(serverForLanguage("rust")?.id, "rust");
assert.equal(serverForLanguage("python")?.id, "python");
assert.equal(serverForLanguage("go")?.id, "go");
assert.equal(serverForLanguage("plaintext"), undefined);

console.log("lsp registry tests passed");
