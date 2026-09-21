import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { McpHttpClient, parseMcpSseResult } from "./httpClient.js";
import { McpRegistry } from "./registry.js";

function listen(handler: (body: unknown) => unknown): Promise<{ url: string; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const msg = raw ? (JSON.parse(raw) as { id?: number; method?: string }) : {};
        const result = handler(msg);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id ?? 1, result }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}/mcp`, server });
    });
  });
}

describe("parseMcpSseResult", () => {
  it("reads the last data result", () => {
    const r = parseMcpSseResult(
      `event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n`,
    );
    expect(r).toEqual({ ok: true });
  });
});

describe("McpHttpClient", () => {
  const servers: Server[] = [];
  afterEach(() => {
    for (const s of servers) s.close();
    servers.length = 0;
  });

  it("initializes and lists tools over HTTP", async () => {
    const { url, server } = await listen((body) => {
      const method = (body as { method?: string }).method;
      if (method === "initialize") return { protocolVersion: "2024-11-05" };
      if (method === "tools/list") {
        return { tools: [{ name: "ping", description: "pong" }] };
      }
      if (method === "tools/call") return { content: [{ type: "text", text: "pong" }] };
      return {};
    });
    servers.push(server);
    const client = new McpHttpClient({ name: "remote", url });
    await client.start();
    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["ping"]);
    expect(await client.callTool("ping", {})).toBe("pong");
    client.dispose();
  });

  it("registry starts an HTTP server", async () => {
    const { url, server } = await listen((body) => {
      const method = (body as { method?: string }).method;
      if (method === "tools/list") return { tools: [{ name: "echo" }] };
      if (method === "tools/call") return { content: [{ type: "text", text: "hi" }] };
      return {};
    });
    servers.push(server);
    const reg = new McpRegistry({
      workspaceRoot: `/tmp/wanwu-mcp-http-${Date.now()}`,
      servers: [{ name: "httpbin", url }],
    });
    await reg.start();
    expect(reg.listTools().map((t) => t.qualifiedName)).toContain("mcp__httpbin__echo");
    expect(await reg.callTool("mcp__httpbin__echo", {})).toBe("hi");
    reg.dispose();
  });
});
