import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { AcpClient, type AcpPermissionRequest } from "./client";

async function main(): Promise<void> {
  const workspaceRoot = path.resolve(__dirname, "../../../../");
  const mockEntry = path.join(workspaceRoot, "packages/wanwu-cli/src/mockAcpServer.ts");
  const child = spawn("pnpm", ["exec", "tsx", mockEntry], {
    cwd: workspaceRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = new AcpClient(child);
  const messages: string[] = [];
  const tools: string[] = [];
  client.on("message", (text: string) => messages.push(text));
  client.on("tool", (tool: { title: string; status: string }) => {
    tools.push(`${tool.status}:${tool.title}`);
  });
  client.on("permission", (req: AcpPermissionRequest) => {
    client.respond(req.id, { optionId: "deny" });
  });

  const init = (await client.initialize()) as { protocolVersion?: string };
  assert.ok(init.protocolVersion?.includes("wanwu-mock"));

  const sessionId = await client.newSession();
  assert.equal(sessionId, "mock-session-1");

  await client.prompt(sessionId, "hello from integration test");
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(messages.some((m) => m.includes("hello from integration test")));
  assert.ok(tools.some((t) => t.includes("Bash") || t.includes("Read")));

  messages.length = 0;
  await client.prompt(sessionId, "[SIMULATE_DANGEROUS] rm -rf ./dist");
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(messages.some((m) => /Blocked by permission/i.test(m)));

  client.dispose();
  console.log("acp client integration OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});