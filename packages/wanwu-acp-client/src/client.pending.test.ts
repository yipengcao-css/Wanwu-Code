import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it } from "vitest";
import { AcpClient } from "./client.js";

function spawnNode(code: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ["-e", code], {
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;
}

describe("AcpClient robustness", () => {
  it("rejects in-flight requests when the backend exits without responding", async () => {
    // Consume stdin, never reply, exit shortly after.
    const child = spawnNode("process.stdin.resume(); setTimeout(() => process.exit(2), 150);");
    const client = new AcpClient(child);
    await expect(client.initialize()).rejects.toThrow(/exited/i);
  });

  it("rejects in-flight requests on dispose()", async () => {
    const child = spawnNode("process.stdin.resume(); setInterval(() => {}, 1000);");
    const client = new AcpClient(child);
    const pending = client.initialize();
    client.dispose();
    await expect(pending).rejects.toThrow(/disposed|exited/i);
  });
});
