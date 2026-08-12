import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface BenchMetric {
  name: string;
  unit: "ms" | "bytes";
  samples: number[];
  median: number;
  p95: number;
  budget?: number;
  status: "pass" | "warn" | "fail";
}

export interface BenchResult {
  schema: "wanwu.bench.v1";
  ts: string;
  gitSha: string;
  host: { os: string; node: string; ci: boolean };
  bin?: string;
  iterations: number;
  metrics: BenchMetric[];
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx]!;
}

export function metric(
  name: string,
  unit: "ms" | "bytes",
  samples: number[],
  budget?: number,
): BenchMetric {
  const med = median(samples);
  const p = p95(samples);
  let status: BenchMetric["status"] = "pass";
  if (budget !== undefined) {
    if (med > budget) status = "fail";
    else if (p > budget) status = "warn";
  }
  return { name, unit, samples, median: med, p95: p, budget, status };
}

export function writeResults(result: BenchResult, outDir = "bench-results"): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "latest.json"), JSON.stringify(result, null, 2), "utf8");
  appendFileSync(join(outDir, "history.jsonl"), `${JSON.stringify(result)}\n`, "utf8");
}

export function printTable(result: BenchResult): void {
  console.log(`\nwanwu bench · ${result.ts} · ${result.gitSha.slice(0, 8)}`);
  console.log("─".repeat(72));
  for (const m of result.metrics) {
    const budget = m.budget !== undefined ? ` / budget ${m.budget}${m.unit}` : "";
    console.log(
      `${m.status === "pass" ? "✓" : m.status === "warn" ? "⚠" : "✗"} ${m.name.padEnd(36)} ${String(m.median).padStart(8)} ${m.unit}${budget}`,
    );
  }
  console.log("─".repeat(72));
}

export function gitSha(): string {
  try {
    const { execSync } = require("node:child_process");
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function hostInfo(): BenchResult["host"] {
  return {
    os: process.platform,
    node: process.version,
    ci: Boolean(process.env.CI),
  };
}
