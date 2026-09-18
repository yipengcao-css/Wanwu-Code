import assert from "node:assert/strict";
import path from "node:path";
import { resolveBundledAcpLaunch } from "./launch.ts";

const workspaceRoot = "/tmp/ws";
const execPath = "/usr/bin/node";

function withFiles(files: string[]) {
  const set = new Set(files.map((f) => path.normalize(f)));
  return (p: string) => set.has(path.normalize(p));
}

{
  const plan = resolveBundledAcpLaunch({
    workspaceRoot,
    execPath,
    env: { WANWU_ACP_COMMAND: "custom-acp --flag" },
    existsSync: () => false,
  });
  assert.equal(plan.command, "custom-acp");
  assert.deepEqual(plan.args, ["--flag"]);
  assert.equal(plan.backend, "env:WANWU_ACP_COMMAND");
}

{
  const bin = path.join("/opt/app/resources/wanwu-cli", "wanwu");
  const plan = resolveBundledAcpLaunch({
    workspaceRoot,
    execPath,
    searchRoots: ["/opt/app/resources/wanwu-cli"],
    platform: "linux",
    env: {},
    existsSync: withFiles([bin]),
  });
  assert.equal(plan.command, bin);
  assert.deepEqual(plan.args, ["--wanwu-internal-acp"]);
  assert.match(plan.backend, /bundled-bin/);
}

{
  const mjs = path.join("/ext/wanwu-cli", "wanwu.mjs");
  const plan = resolveBundledAcpLaunch({
    workspaceRoot,
    execPath,
    searchRoots: ["/ext/wanwu-cli"],
    electronAsNode: false,
    env: {},
    existsSync: withFiles([mjs]),
  });
  assert.equal(plan.command, execPath);
  assert.deepEqual(plan.args, [mjs, "--wanwu-internal-acp"]);
  assert.equal(plan.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.match(plan.backend, /mjs/);
}

{
  const repoRoot = "/repo";
  const tsx = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const entry = path.join(repoRoot, "packages", "wanwu-cli", "src", "index.ts");
  const plan = resolveBundledAcpLaunch({
    workspaceRoot,
    execPath,
    repoRoot,
    env: {},
    existsSync: withFiles([tsx, entry]),
  });
  assert.equal(plan.command, execPath);
  assert.deepEqual(plan.args, [tsx, entry, "acp"]);
  assert.equal(plan.backend, "wanwu-native:tsx-dev");
}

{
  assert.throws(
    () =>
      resolveBundledAcpLaunch({
        workspaceRoot,
        execPath,
        env: {},
        existsSync: () => false,
      }),
    /未找到 wanwu ACP/,
  );
}

console.log("acp launch tests passed");
