import assert from "node:assert/strict";
import path from "node:path";
import { resolveShellAcpLaunch } from "./acpLaunch.ts";

const workspaceRoot = "/tmp/ws";
const execPath = "/opt/Wanwu Code/wanwu-code";
const resourcesPath = "/opt/Wanwu Code/resources";

function withFiles(files: string[]) {
  const set = new Set(files.map((f) => path.normalize(f)));
  return (p: string) => set.has(path.normalize(p));
}

{
  const plan = resolveShellAcpLaunch({
    workspaceRoot,
    isPackaged: true,
    resourcesPath,
    execPath,
    platform: "linux",
    env: { WANWU_ACP_COMMAND: "custom-acp --flag" },
    existsSync: () => false,
  });
  assert.equal(plan.command, "custom-acp");
  assert.deepEqual(plan.args, ["--flag"]);
  assert.equal(plan.backend, "env:WANWU_ACP_COMMAND");
}

{
  const bin = path.join(resourcesPath, "wanwu-cli", "wanwu");
  const plan = resolveShellAcpLaunch({
    workspaceRoot,
    isPackaged: true,
    resourcesPath,
    execPath,
    platform: "linux",
    env: {},
    existsSync: withFiles([bin]),
  });
  assert.equal(plan.command, bin);
  assert.deepEqual(plan.args, ["--wanwu-internal-acp"]);
  assert.equal(plan.env.WANWU_INTERNAL_ACP, "1");
  assert.equal(plan.spawnCwd, workspaceRoot);
  assert.match(plan.backend, /bundled-bin/);
}

{
  const mjs = path.join(resourcesPath, "wanwu-cli", "wanwu.mjs");
  const plan = resolveShellAcpLaunch({
    workspaceRoot,
    isPackaged: true,
    resourcesPath,
    execPath,
    platform: "win32",
    env: {},
    existsSync: withFiles([mjs]),
  });
  assert.equal(plan.command, execPath);
  assert.deepEqual(plan.args, [mjs, "--wanwu-internal-acp"]);
  assert.equal(plan.env.ELECTRON_RUN_AS_NODE, "1");
  assert.match(plan.backend, /bundled-mjs/);
}

{
  const repoRoot = "/repo";
  const mjs = path.join(repoRoot, "dist-bin", "wanwu.mjs");
  const plan = resolveShellAcpLaunch({
    workspaceRoot,
    isPackaged: false,
    execPath,
    repoRoot,
    platform: "linux",
    env: {},
    existsSync: withFiles([mjs]),
  });
  assert.equal(plan.command, execPath);
  assert.deepEqual(plan.args, [mjs, "--wanwu-internal-acp"]);
  assert.match(plan.backend, /dist-mjs/);
}

{
  assert.throws(
    () =>
      resolveShellAcpLaunch({
        workspaceRoot,
        isPackaged: true,
        resourcesPath,
        execPath,
        env: {},
        existsSync: () => false,
      }),
    /未找到随包 ACP 后端/,
  );
}

console.log("acpLaunch tests passed");
