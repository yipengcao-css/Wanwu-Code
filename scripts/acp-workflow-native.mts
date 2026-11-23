/**
 * Assert wanwu-native emits workflow_state on Verify mode (no LLM credentials).
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wanwu = path.join(root, "packages/wanwu-cli/src/index.ts");

const workspace = mkdtempSync(path.join(tmpdir(), "wanwu-wf-"));
mkdirSync(path.join(workspace, ".wanwu"), { recursive: true });
writeFileSync(
  path.join(workspace, ".wanwu", "settings.toml"),
  'acp_backend = "wanwu-native"\npermission_mode = "accept-all"\n',
);
writeFileSync(path.join(workspace, "package.json"), JSON.stringify({ name: "wf-smoke", private: true }));

const child = spawn("pnpm", ["exec", "tsx", wanwu, "acp"], {
  cwd: root,
  env: { ...process.env, WANWU_WORKSPACE_ROOT: workspace, WANWU_FORCE_DETERMINISTIC: "1" },
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = "";
const lines: string[] = [];
child.stdout.on("data", (d: Buffer) => {
  buf += d.toString("utf8");
  let idx: number;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (line.trim()) lines.push(line);
  }
});

function send(obj: unknown): void {
  child.stdin.write(`${JSON.stringify(obj)}\n`);
}

function waitFor(predicate: (line: string) => boolean, ms = 120_000): Promise<string> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      const hit = lines.find(predicate);
      if (hit) return resolve(hit);
      if (Date.now() - start > ms) {
        return reject(new Error(`timeout; tail=${lines.slice(-8).join(" | ")}`));
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

async function main(): Promise<void> {
  await new Promise((r) => setTimeout(r, 400));
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "0.1.0-wanwu-native", clientInfo: { name: "wf-smoke", version: "0" } },
  });
  await waitFor((l) => l.includes('"id":1'));
  send({ jsonrpc: "2.0", id: 2, method: "session/new", params: {} });
  const newLine = await waitFor((l) => l.includes('"id":2') && l.includes("sessionId"));
  const sessionId = (JSON.parse(newLine) as { result: { sessionId: string } }).result.sessionId;

  send({
    jsonrpc: "2.0",
    id: 3,
    method: "session/prompt",
    params: { sessionId, prompt: "[MODE=verify] run verify gate" },
  });

  await waitFor((l) => l.includes("workflow_state") && l.includes("verifying"));
  await waitFor((l) => l.includes('"id":3'));
  const wfDone = lines.some((l) => l.includes("workflow_state") && (l.includes("done") || l.includes("acting")));
  if (!wfDone) {
    throw new Error("expected workflow_state done or acting after verify");
  }

  child.kill();
  console.log("acp-workflow-native OK");
}

main().catch((err) => {
  console.error(err);
  child.kill();
  process.exit(1);
});
