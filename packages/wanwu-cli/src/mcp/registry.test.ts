import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dispatchTool } from "../native/toolDispatch.js";
import {
  disposeMcpRegistry,
  ensureMcpRegistry,
  McpRegistry,
} from "./registry.js";

const fixtureServer = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fakeMcpServer.mjs",
);

describe("McpRegistry + dispatch", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const r of roots) disposeMcpRegistry(r);
    roots.length = 0;
  });

  it("starts fake server and lists namespaced tools", async () => {
    const workspaceRoot = `/tmp/wanwu-mcp-reg-${Date.now()}`;
    roots.push(workspaceRoot);
    const reg = new McpRegistry({
      workspaceRoot,
      servers: [{ name: "fake", command: "node", args: [fixtureServer] }],
    });
    await reg.start();
    const tools = reg.listTools();
    expect(tools.map((t) => t.qualifiedName)).toContain("mcp__fake__echo");
    const out = await reg.callTool("mcp__fake__echo", { message: "ping" });
    expect(out).toBe("ping");
    expect(reg.listResources().map((r) => r.uri)).toContain("fake://notes");
    expect(await reg.readResource("fake://notes")).toBe("resource:fake://notes");
    expect(reg.listToolSpecs().some((t) => t.name === "McpReadResource")).toBe(true);
    reg.dispose();
  });

  it("reads MCP resources through dispatchTool", async () => {
    const workspaceRoot = `/tmp/wanwu-mcp-res-${Date.now()}`;
    roots.push(workspaceRoot);
    await ensureMcpRegistry(workspaceRoot, {
      servers: [{ name: "fake", command: "node", args: [fixtureServer] }],
    });
    const viaDispatch = await dispatchTool(
      {
        workspaceRoot,
        sessionId: "s-res",
        permissionMode: "ask",
        mode: "agent",
      },
      "agent",
      "McpReadResource",
      JSON.stringify({ uri: "fake://notes" }),
    );
    expect(viaDispatch.ok).toBe(true);
    expect(viaDispatch.text).toBe("resource:fake://notes");
  });

  it("routes mcp__ tools through dispatchTool + hooks", async () => {
    const workspaceRoot = `/tmp/wanwu-mcp-dispatch-${Date.now()}`;
    roots.push(workspaceRoot);
    await ensureMcpRegistry(workspaceRoot, {
      servers: [{ name: "fake", command: "node", args: [fixtureServer] }],
    });
    const result = await dispatchTool(
      {
        workspaceRoot,
        sessionId: "s1",
        permissionMode: "ask",
        mode: "agent",
      },
      "agent",
      "mcp__fake__echo",
      JSON.stringify({ message: "via-dispatch" }),
    );
    expect(result.ok).toBe(true);
    expect(result.text).toBe("via-dispatch");
  });
});
