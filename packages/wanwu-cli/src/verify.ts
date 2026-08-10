import { spawnSync } from "node:child_process";
import { WorkflowMachine } from "@wanwu/workflow";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export function runVerify(cwd: string = findWorkspaceRoot()): number {
  const wf = new WorkflowMachine("acting");
  wf.send("start_verify");

  console.log(`[wanwu verify] workflow → ${wf.state} (isolated checker)`);
  const steps: Array<[string, string[]]> = [
    ["pnpm", ["typecheck"]],
    ["pnpm", ["test"]],
    ["pnpm", ["lint"]],
  ];

  for (const [cmd, args] of steps) {
    console.log(`[wanwu verify] $ ${cmd} ${args.join(" ")}`);
    const result = spawnSync(cmd, args, { cwd, encoding: "utf8", env: process.env });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if ((result.status ?? 1) !== 0) {
      wf.send("verify_fail");
      console.error(`[wanwu verify] FAILED at ${cmd}; workflow → ${wf.state}`);
      return result.status ?? 1;
    }
  }

  wf.send("verify_pass");
  console.log(`[wanwu verify] PASSED; workflow → ${wf.state}`);
  return 0;
}