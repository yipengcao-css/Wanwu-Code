import type { McpClient, McpServerConfig, McpTool } from "./types.js";
import { authorizationHeader } from "./oauth.js";

function parseSseResult(body: string): unknown {
  const datas = [...body.matchAll(/^data:\s*(.+)$/gm)].map((m) => m[1] ?? "");
  for (let i = datas.length - 1; i >= 0; i -= 1) {
    let msg: { result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(datas[i]!) as { result?: unknown; error?: { message?: string } };
    } catch {
      continue;
    }
    if (msg.error) throw new Error(msg.error.message ?? "MCP HTTP error");
    if (msg.result !== undefined) return msg.result;
  }
  throw new Error("MCP SSE response had no JSON-RPC result");
}

/**
 * Streamable HTTP / SSE MCP client (JSON-RPC POST).
 */
export class McpHttpClient implements McpClient {
  private nextId = 1;
  private started = false;

  constructor(private readonly config: McpServerConfig) {}

  get name(): string {
    return this.config.name;
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (!this.config.url) {
      throw new Error(`mcp server ${this.config.name} has no url`);
    }
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "wanwu", version: "1.0.0-beta" },
    });
    this.started = true;
  }

  async listTools(): Promise<McpTool[]> {
    const result = (await this.request("tools/list", {})) as { tools?: McpTool[] };
    return Array.isArray(result.tools) ? result.tools : [];
  }

  async listResources(): Promise<Array<{ uri: string; name?: string; description?: string; mimeType?: string }>> {
    try {
      const result = (await this.request("resources/list", {})) as {
        resources?: Array<{ uri: string; name?: string; description?: string; mimeType?: string }>;
      };
      return Array.isArray(result.resources) ? result.resources : [];
    } catch {
      return [];
    }
  }

  async readResource(uri: string): Promise<string> {
    const result = (await this.request("resources/read", { uri })) as {
      contents?: Array<{ uri?: string; mimeType?: string; text?: string; blob?: string }>;
    };
    const parts = (result.contents ?? []).map((c) => {
      if (typeof c.text === "string") return c.text;
      if (typeof c.blob === "string") return `[binary ${c.mimeType ?? "blob"} ${c.blob.slice(0, 32)}…]`;
      return "";
    });
    return parts.filter(Boolean).join("\n") || JSON.stringify(result);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.request("tools/call", { name, arguments: args })) as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    const texts = (result.content ?? [])
      .filter((c) => typeof c.text === "string")
      .map((c) => c.text!);
    const body = texts.join("\n") || JSON.stringify(result);
    if (result.isError) throw new Error(body);
    return body;
  }

  dispose(): void {
    this.started = false;
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const url = this.config.url;
    if (!url) throw new Error(`mcp server ${this.config.name} has no url`);
    const id = this.nextId++;
    const auth = await authorizationHeader(this.config.name, this.config.oauth);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...this.config.headers,
    };
    if (auth) headers.authorization = auth;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const ctype = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`mcp ${this.config.name} ${method} HTTP ${res.status}: ${text.slice(0, 240)}`);
    }
    if (ctype.includes("text/event-stream")) {
      return parseSseResult(text);
    }
    const msg = JSON.parse(text) as { result?: unknown; error?: { message?: string } };
    if (msg.error) throw new Error(msg.error.message ?? "MCP HTTP error");
    return msg.result;
  }
}

export function parseMcpSseResult(body: string): unknown {
  return parseSseResult(body);
}
