import assert from "node:assert/strict";
import { resolveTsLspLaunch } from "./resolveTsLsp.ts";

const overridden = resolveTsLspLaunch({
  env: { WANWU_TSSERVER_COMMAND: "/opt/custom-tsserver" } as NodeJS.ProcessEnv,
});
assert.ok(overridden);
assert.equal(overridden.command, "/opt/custom-tsserver");
assert.deepEqual(overridden.args, ["--stdio"]);

const withArgs = resolveTsLspLaunch({
  env: { WANWU_TSSERVER_COMMAND: "node /tmp/cli.mjs" } as NodeJS.ProcessEnv,
});
assert.ok(withArgs);
assert.equal(withArgs.command, "node");
assert.deepEqual(withArgs.args, ["/tmp/cli.mjs", "--stdio"]);

const fallback = resolveTsLspLaunch({ env: {} as NodeJS.ProcessEnv, repoRoot: "/nonexistent" });
assert.ok(fallback);
assert.ok(fallback.command.length > 0);

console.log("resolveTsLsp tests passed");
