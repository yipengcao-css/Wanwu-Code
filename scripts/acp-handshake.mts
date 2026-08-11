/**
 * Golden-path ACP handshake through `wanwu acp` with mock backend override.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mock = path.join(root, "packages/wanwu-cli/src/mockAcpServer.ts");
const wanwu = path.join(root, "packages/wanwu-cli/src/index.ts");

const child = spawn("pnpm", ["exec", "tsx", wanwu, "acp"], {
  cwd: root,
  env: {
    ...process.env,
    WANWU_ACP_COMMAND: `pnpm exec tsx ${mock}`,
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

function send(obj: unknown): void {
  child.stdin.write(`${JSON.stringify(obj)}\n`);
}

function waitFor(predicate: (line: string) => boolean, ms = 5000): Promise<string> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      const hit = lines.find(predicate);
      if (hit) return resolve(hit);
      if (Date.now() - start > ms) return reject(new Error("timeout waiting for ACP response"));
      setTimeout(tick, 25);
    };
    tick();
  });
}

async function main(): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "0.1.0-wanwu-mock", clientInfo: { name: "smoke", version: "0" } },
  });
  await waitFor((l) => l.includes('"id":1') && l.includes("wanwu-mock"));
  send({ jsonrpc: "2.0", id: 2, method: "session/new", params: {} });
  await waitFor((l) => l.includes('"id":2') && l.includes("mock-session-1"));
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "session/prompt",
    params: { sessionId: "mock-session-1", prompt: "handshake ok" },
  });
  await waitFor((l) => l.includes("Wanwu mock reply") || l.includes("handshake ok"));
  await waitFor((l) => l.includes('"id":3') && l.includes("end_turn"));
  child.kill();
  console.log("acp-handshake via wanwu acp + mock OK");
}

main().catch((err) => {
  console.error(err);
  child.kill();
  process.exit(1);
});