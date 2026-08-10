import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { AcpClient } from "./client";

async function main(): Promise<void> {
  const workspaceRoot = path.resolve(__dirname, "../../../../");
  const mockEntry = path.join(workspaceRoot, "packages/wanwu-cli/src/mockAcpServer.ts");
  const child = spawn("pnpm", ["exec", "tsx", mockEntry], {
    cwd: workspaceRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = new AcpClient(child);
  const messages: string[] = [];
  client.on("message", (text: string) => messages.push(text));

  const init = (await client.initialize()) as { protocolVersion?: string };
  assert.ok(init.protocolVersion?.includes("wanwu-mock"));

  const sessionId = await client.newSession();
  assert.equal(sessionId, "mock-session-1");

  await client.prompt(sessionId, "hello from integration test");
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(messages.some((m) => m.includes("hello from integration test")));

  client.dispose();
  console.log("acp client integration OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});