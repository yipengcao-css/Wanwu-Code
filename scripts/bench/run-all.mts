import { benchAcpHandshake } from "./acp-handshake.mts";
import { benchCliStartup } from "./cli-startup.mts";
import { benchArtifactSizes } from "./shell-size.mts";
import { benchToolLatency } from "./tool-latency.mts";
import { gitSha, hostInfo, printTable, writeResults, type BenchResult } from "./lib.mts";

const isCi = process.argv.includes("--ci");
const iterations = isCi ? 5 : 7;

const result: BenchResult = {
  schema: "wanwu.bench.v1",
  ts: new Date().toISOString(),
  gitSha: gitSha(),
  host: hostInfo(),
  iterations,
  metrics: [],
};

console.log("wanwu bench — collecting…");

result.metrics.push(...benchCliStartup(iterations));
result.metrics.push(...(await benchToolLatency(iterations)));
result.metrics.push(...(await benchAcpHandshake(Math.min(iterations, 5))));
result.metrics.push(...benchArtifactSizes());

printTable(result);
writeResults(result);

const failed = result.metrics.filter((m) => m.status === "fail");
if (failed.length && process.env.WANWU_BENCH_STRICT === "1") {
  console.error(`bench failed: ${failed.map((m) => m.name).join(", ")}`);
  process.exit(1);
}
if (failed.length) {
  console.warn(`bench warnings (soft): ${failed.map((m) => m.name).join(", ")}`);
}
