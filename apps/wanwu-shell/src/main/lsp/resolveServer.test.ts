import assert from "node:assert/strict";
import { resolveLspServer } from "./resolveServer.ts";

const overridden = resolveLspServer(
  { id: "rust", command: "rust-analyzer", args: [], languages: ["rust"] },
  { env: { WANWU_LSP_RUST_COMMAND: "/opt/rust-analyzer" } as NodeJS.ProcessEnv },
);
assert.ok(overridden);
assert.equal(overridden.command, "/opt/rust-analyzer");

const ts = resolveLspServer(
  { id: "typescript", command: "typescript-language-server", args: ["--stdio"], languages: ["typescript"] },
  { env: {} as NodeJS.ProcessEnv },
);
assert.ok(ts);

console.log("lsp resolveServer tests passed");
