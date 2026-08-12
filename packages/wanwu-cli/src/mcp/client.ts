import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as readline from "node:readline";
import type { McpServerConfig, McpTool } from "./types.js";

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

/**
 * Minimal MCP JSON-RPC client over stdio (initialize → tools/list → tools/call).
 * Does not pull @modelcontextprotocol/sdk — keeps the bridge thin.
 */
export class McpStdioClient {
  private child: ChildProcessWithoutNullStreams | undefined;
  private rl: readline.Interface | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private closed = false;

  constructor(private readonly config: McpServerConfig) {}

  get name(): string {
    return this.config.name;
  }

  async start(): Promise<void> {
    if (this.child) return;
    this.child = spawn(this.config.command, this.config.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.config.env },
      shell: process.platform === "win32",
    });
    this.rl = readline.createInterface({ input: this.child.stdout });
    this.rl.on("line", (line) => this.onLine(line));
    this.child.stderr?.on("data", (buf: Buffer) => {
      process.stderr.write(`[mcp:${this.config.name}] ${buf.toString("utf8")}`);
    });
    this.child.on("exit", () => {
      this.closed = true;
      for (const [, p] of this.pending) p.reject(new Error(`mcp server ${this.config.name} exited`));
      this.pending.clear();
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "wanwu", version: "1.0.0-beta" },
    });
    this.notify("notifications/initialized", {});
  }

  async listTools(): Promise<McpTool[]> {
    const result = (await this.request("tools/list", {})) as { tools?: McpTool[] };
    return Array.isArray(result.tools) ? result.tools : [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.request("tools/call", {
      name,
      arguments: args,
    })) as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    const texts = (result.content ?? [])
      .filter((c) => typeof c.text === "string")
      .map((c) => c.text!);
    const body = texts.join("\n") || JSON.stringify(result);
    if (result.isError) {
      throw new Error(body);
    }
    return body;
  }

  dispose(): void {
    this.closed = true;
    try {
      this.rl?.close();
    } catch {
      /* ignore */
    }
    try {
      this.child?.kill();
    } catch {
      /* ignore */
    }
    this.child = undefined;
  }

  private notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (this.closed || !this.child) {
      return Promise.reject(new Error(`mcp server ${this.config.name} not running`));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ jsonrpc: "2.0", id, method, params });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`mcp ${this.config.name} ${method} timed out`));
        }
      }, 30_000);
    });
  }

  private write(msg: unknown): void {
    this.child?.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  private onLine(line: string): void {
    if (!line.trim()) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof msg.id === "number" && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) {
        const e = msg.error as { message?: string };
        p.reject(new Error(e.message ?? "MCP error"));
      } else {
        p.resolve(msg.result);
      }
    }
  }
}
