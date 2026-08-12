import { metric, type BenchMetric } from "./lib.mts";
import { buildFixtureTree } from "./fixture-tree.mts";

export async function benchToolLatency(iterations = 7): Promise<BenchMetric[]> {
  const { toolGlob, toolGrep, toolRead } = await import(
    "../../packages/wanwu-cli/src/native/tools.js"
  );
  const fixture = buildFixtureTree();

  const metrics: BenchMetric[] = [];

  const globSamples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    toolGlob(fixture.root, "**/*.ts");
    globSamples.push(performance.now() - start);
  }
  metrics.push(metric("tool.glob.ms", "ms", globSamples, 50));

  const grepSamples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    toolGrep(fixture.root, "needle-token-2", "**/*.txt");
    grepSamples.push(performance.now() - start);
  }
  metrics.push(metric("tool.grep.ms", "ms", grepSamples, 80));

  const readSamples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    toolRead(fixture.root, "dir-1/file-10.ts");
    readSamples.push(performance.now() - start);
  }
  metrics.push(metric("tool.read.ms", "ms", readSamples, 10));

  return metrics;
}
