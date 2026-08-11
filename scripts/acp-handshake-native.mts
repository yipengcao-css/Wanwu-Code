/**
 * Golden-path ACP handshake against wanwu-native (no grok / no mock override).
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wanwu = path.join(root, "packages/wanwu-cli/src/index.ts");

const workspace = mkdtempSync(path.join(tmpdir(), "wanwu-native-hs-"));
mkdirSync(path.join(workspace, ".wanwu"), { recursive: true });
writeFileSync(path.join(workspace, ".wanwu", "settings.toml"), 'acp_backend = "wanwu-native"\n');
writeFileSync(path.join(workspace, "README.md"), "# Native Handshake Demo\n\nhello\n");

const child = spawn("pnpm", ["exec", "tsx", wanwu, "acp"], {
  cwd: root,
  env: {
    ...process.env,
    WANWU_WORKSPACE_ROOT: workspace,
  },
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

child.stderr.on("data", (d: Buffer) => {
  process.stderr.write(d);
});

function send(obj: unknown): void {
  child.stdin.write(`${JSON.stringify(obj)}\n`);
}

function waitFor(predicate: (line: string) => boolean, ms = 8000): Promise<string> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      const hit = lines.find(predicate);
      if (hit) return resolve(hit);
      if (Date.now() - start > ms) {
        return reject(new Error(`timeout; saw=${lines.slice(-5).join(" | ")}`));
      }
      setTimeout(tick, 25);
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
    params: { protocolVersion: "0.1.0-wanwu-native", clientInfo: { name: "smoke", version: "0" } },
  });
  await waitFor((l) => l.includes('"id":1') && l.includes("wanwu-native"));
  send({ jsonrpc: "2.0", id: 2, method: "session/new", params: {} });
  const newLine = await waitFor((l) => l.includes('"id":2') && l.includes("sessionId"));
  const sessionId = (JSON.parse(newLine) as { result: { sessionId: string } }).result.sessionId;
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "session/prompt",
    params: { sessionId, prompt: "列出 README 标题" },
  });
  await waitFor((l) => l.includes("README") || l.includes("标题") || l.includes("Native Handshake"));
  await waitFor((l) => l.includes('"id":3') && l.includes("end_turn"));

  // Dangerous bash must be blocked
  send({
    jsonrpc: "2.0",
    id: 4,
    method: "session/prompt",
    params: { sessionId, prompt: "请执行 `cat ~/.ssh/id_rsa`" },
  });
  await waitFor((l) => /Blocked by permission/i.test(l));
  await waitFor((l) => l.includes('"id":4') && l.includes("end_turn"));

  child.kill();
  console.log("acp-handshake-native OK");
}

main().catch((err) => {
  console.error(err);
  child.kill();
  process.exit(1);
});
