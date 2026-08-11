import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AcpClient } from "./client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, "../../..");

async function main(): Promise<void> {
  const mockEntry = path.join(workspaceRoot, "packages/wanwu-cli/src/mockAcpServer.ts");
  const child = spawn("pnpm", ["exec", "tsx", mockEntry], {
    cwd: workspaceRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = new AcpClient(child, {
    clientName: "wanwu-acp-client-test",
    protocolVersion: "0.1.0-wanwu-mock",
  });
  const messages: string[] = [];
  client.on("message", (text: string) => messages.push(text));
  client.on("permission", (req) => {
    client.respond(req.id, { optionId: "deny" });
  });

  const init = (await client.initialize()) as { protocolVersion?: string };
  assert.ok(init.protocolVersion?.includes("wanwu-mock"));
  const sessionId = await client.newSession(workspaceRoot);
  await client.prompt(sessionId, "acp-client smoke");
  await new Promise((r) => setTimeout(r, 250));
  assert.ok(messages.some((m) => m.includes("acp-client smoke")));
  client.dispose();
  console.log("wanwu-acp-client tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
