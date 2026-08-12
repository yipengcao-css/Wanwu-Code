import { spawnSync } from "node:child_process";
import { WorkflowMachine } from "@wanwu/workflow";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export interface VerifyResult {
  code: number;
  log: string;
  state: string;
}

export function runVerify(
  cwd: string = findWorkspaceRoot(),
  opts?: { quiet?: boolean },
): number {
  return runVerifyDetailed(cwd, opts).code;
}

/** Isolated verify gate; when `quiet`, do not touch stdout (ACP-safe). */
export function runVerifyDetailed(
  cwd: string = findWorkspaceRoot(),
  opts?: { quiet?: boolean },
): VerifyResult {
  const quiet = Boolean(opts?.quiet);
  const wf = new WorkflowMachine("acting");
  wf.send("start_verify");
  const lines: string[] = [];
  const emit = (line: string) => {
    lines.push(line);
    if (!quiet) console.log(line);
  };

  emit(`[wanwu verify] workflow → ${wf.state} (isolated checker)`);
  const steps: Array<[string, string[]]> = [
    ["pnpm", ["typecheck"]],
    ["pnpm", ["test"]],
    ["pnpm", ["lint"]],
  ];

  for (const [cmd, args] of steps) {
    emit(`[wanwu verify] $ ${cmd} ${args.join(" ")}`);
    const result = spawnSync(cmd, args, { cwd, encoding: "utf8", env: process.env });
    if (result.stdout) {
      lines.push(result.stdout);
      if (!quiet) process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      lines.push(result.stderr);
      if (!quiet) process.stderr.write(result.stderr);
    }
    if ((result.status ?? 1) !== 0) {
      wf.send("verify_fail");
      emit(`[wanwu verify] FAILED at ${cmd}; workflow → ${wf.state}`);
      return { code: result.status ?? 1, log: lines.join(""), state: wf.state };
    }
  }

  wf.send("verify_pass");
  emit(`[wanwu verify] PASSED; workflow → ${wf.state}`);
  return { code: 0, log: lines.join(""), state: wf.state };
}
