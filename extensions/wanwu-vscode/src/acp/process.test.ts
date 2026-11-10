import assert from "node:assert/strict";
import path from "node:path";
import { resolveExtensionAcpLaunch } from "./process.ts";

const workspaceRoot = "/tmp/ws";
const repoRoot = path.resolve(import.meta.dirname ?? ".", "../../../..");

{
  const plan = resolveExtensionAcpLaunch({
    cwd: workspaceRoot,
    workspaceRoot,
    commandOverride: "my-acp --stdio",
  });
  assert.equal(plan.command, "my-acp");
  assert.deepEqual(plan.args, ["--stdio"]);
  assert.equal(plan.backend, "env:WANWU_ACP_COMMAND");
}

{
  const plan = resolveExtensionAcpLaunch({
    cwd: workspaceRoot,
    workspaceRoot,
    repoRoot,
  });
  assert.ok(plan.command.length > 0);
  assert.ok(
    plan.backend.includes("tsx-dev") ||
      plan.backend.includes("dist") ||
      plan.backend.includes("bundled"),
    `unexpected backend ${plan.backend}`,
  );
  assert.equal(plan.env.WANWU_WORKSPACE_ROOT, workspaceRoot);
}

{
  const plan = resolveExtensionAcpLaunch({
    cwd: workspaceRoot,
    workspaceRoot,
    repoRoot,
    useMock: true,
  });
  assert.equal(plan.backend, "mock-tsx");
  assert.ok(plan.args.some((a) => a.includes("mockAcpServer")));
}

console.log("extension acp process tests passed");
