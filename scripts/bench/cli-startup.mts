import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { metric, type BenchMetric } from "./lib.mts";

const root = process.cwd();
const bundled = join(root, "dist-bin", "wanwu.mjs");
const useBundled = existsSync(bundled);

function runOnce(args: string[]): number {
  const start = performance.now();
  if (useBundled) {
    spawnSync(process.execPath, [bundled, ...args], { stdio: "ignore" });
  } else {
    spawnSync("pnpm", ["wanwu", ...args], { stdio: "ignore", env: process.env });
  }
  return performance.now() - start;
}

export function benchCliStartup(iterations = 7): BenchMetric[] {
  const metrics: BenchMetric[] = [];
  const commands: Array<{ name: string; args: string[]; budget: number }> = [
    { name: "cli.help.startup_ms", args: ["help"], budget: 150 },
    { name: "cli.doctor.startup_ms", args: ["doctor"], budget: 400 },
  ];

  for (const cmd of commands) {
    // warmup
    runOnce(cmd.args);
    const samples: number[] = [];
    for (let i = 0; i < iterations; i += 1) {
      samples.push(runOnce(cmd.args));
    }
    metrics.push(metric(cmd.name, "ms", samples, cmd.budget));
  }

  return metrics;
}
