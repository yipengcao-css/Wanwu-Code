import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { metric, type BenchMetric } from "./lib.mts";

function dirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) total += dirSize(p);
    else total += st.size;
  }
  return total;
}

export function benchArtifactSizes(): BenchMetric[] {
  const root = process.cwd();
  const cliPath = join(root, "dist-bin", "wanwu.mjs");
  const shellDist = join(root, "apps", "wanwu-shell", "dist");

  const cliBytes = existsSync(cliPath) ? statSync(cliPath).size : 0;
  const shellBytes = dirSize(shellDist);

  return [
    metric("artifact.cli_mjs_bytes", "bytes", [cliBytes], 512 * 1024),
    metric("artifact.shell_dist_bytes", "bytes", [shellBytes], 20 * 1024 * 1024),
  ];
}
