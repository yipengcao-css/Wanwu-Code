import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { metric, type BenchMetric } from "./lib.mts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wanwu = path.join(root, "packages/wanwu-cli/src/index.ts");

function once(): Promise<{ spawnToReady: number; initialize: number; sessionNew: number; prompt: number }> {
  return new Promise((resolve, reject) => {
    const workspace = mkdtempSync(path.join(tmpdir(), "wanwu-bench-hs-"));
    mkdirSync(path.join(workspace, ".wanwu"), { recursive: true });
    writeFileSync(path.join(workspace, ".wanwu", "settings.toml"), 'acp_backend = "wanwu-native"\n');
    writeFileSync(path.join(workspace, "README.md"), "# Bench\n");

    const t0 = performance.now();
    const child = spawn("pnpm", ["exec", "tsx", wanwu, "acp"], {
      cwd: root,
      env: { ...process.env, WANWU_WORKSPACE_ROOT: workspace },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buf = "";
    const lines: string[] = [];
    let spawnToReady = 0;
    let initializeMs = 0;
    let sessionNewMs = 0;
    let promptMs = 0;

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("handshake timeout"));
    }, 15_000);

    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) lines.push(line);
      }
    });

    child.stderr.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      if (s.includes("ready") && !spawnToReady) {
        spawnToReady = performance.now() - t0;
        const t1 = performance.now();
        child.stdin.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`,
        );
        waitFor((l) => l.includes('"id":1')).then(() => {
          initializeMs = performance.now() - t1;
          const t2 = performance.now();
          child.stdin.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "session/new", params: {} })}\n`,
          );
          waitFor((l) => l.includes('"id":2')).then(() => {
            sessionNewMs = performance.now() - t2;
            const t3 = performance.now();
            child.stdin.write(
              `${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "session/prompt", params: { sessionId: "wanwu-native-1", prompt: "hi" } })}\n`,
            );
            waitFor((l) => l.includes('"id":3')).then(() => {
              promptMs = performance.now() - t3;
              clearTimeout(timeout);
              child.kill();
              resolve({ spawnToReady, initialize: initializeMs, sessionNew: sessionNewMs, prompt: promptMs });
            });
          });
        });
      }
    });

    function waitFor(predicate: (line: string) => boolean, ms = 8000): Promise<string> {
      const start = Date.now();
      return new Promise((res, rej) => {
        const tick = (): void => {
          const hit = lines.find(predicate);
          if (hit) return res(hit);
          if (Date.now() - start > ms) return rej(new Error("timeout"));
          setTimeout(tick, 25);
        };
        tick();
      });
    }
  });
}

export async function benchAcpHandshake(iterations = 5): Promise<BenchMetric[]> {
  const spawnSamples: number[] = [];
  const initSamples: number[] = [];
  const sessionSamples: number[] = [];
  const promptSamples: number[] = [];

  // warmup
  await once();

  for (let i = 0; i < iterations; i += 1) {
    const r = await once();
    spawnSamples.push(r.spawnToReady);
    initSamples.push(r.initialize);
    sessionSamples.push(r.sessionNew);
    promptSamples.push(r.prompt);
  }

  return [
    metric("acp.spawn_to_ready_ms", "ms", spawnSamples, 3000),
    metric("acp.initialize_ms", "ms", initSamples, 500),
    metric("acp.session_new_ms", "ms", sessionSamples, 200),
    metric("acp.prompt_end_turn_ms", "ms", promptSamples, 2000),
  ];
}
