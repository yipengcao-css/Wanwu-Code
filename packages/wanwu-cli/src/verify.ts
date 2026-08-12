import { spawnSync } from "node:child_process";
import { completeChat, hasProviderCredentials } from "@wanwu/providers";
import { loadWanwuConfig } from "@wanwu/config";
import { WorkflowMachine } from "@wanwu/workflow";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export interface VerifyResult {
  code: number;
  log: string;
  state: string;
  /** LLM reviewer summary when credentials are available. */
  review?: string;
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

/**
 * Verify + independent LLM review of the current diff.
 * The reviewer sees only the verify log and `git diff`, not the Act transcript.
 */
export async function runVerifyWithReview(
  cwd: string = findWorkspaceRoot(),
  opts?: { quiet?: boolean },
): Promise<VerifyResult> {
  const base = runVerifyDetailed(cwd, opts);
  const { config } = loadWanwuConfig(cwd);
  if (!hasProviderCredentials(config)) {
    return base;
  }

  const diff = spawnSync("git", ["diff", "--stat", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  const diffText = `${diff.stdout ?? ""}\n${diff.stderr ?? ""}`.trim().slice(0, 4000);

  try {
    const res = await completeChat({
      config,
      request: {
        messages: [
          {
            role: "system",
            content:
              "You are Wanwu Verify, an independent reviewer. Given the gate log and diff stat, " +
              "reply in Chinese with: 结论（通过/不通过）+ 主要风险 + 建议。Be concise.",
          },
          {
            role: "user",
            content: `Verify exit=${base.code}\n\nLog:\n${base.log.slice(-3000)}\n\nDiff stat:\n${diffText || "(no diff)"}`,
          },
        ],
        temperature: 0.1,
        maxTokens: 1024,
      },
    });
    return { ...base, review: res.text };
  } catch {
    return base;
  }
}
