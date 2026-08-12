import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import * as readline from "node:readline";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export interface AcpPermissionRequest {
  id: number;
  toolName: string;
  summary: string;
  risk?: string;
}

export interface AcpEditProposal {
  path: string;
  before: string;
  after: string;
}

export interface AcpClientOptions {
  clientName?: string;
  clientVersion?: string;
  protocolVersion?: string;
}

export class AcpClient extends EventEmitter {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private rl: readline.Interface | undefined;
  private readonly clientName: string;
  private readonly clientVersion: string;
  private readonly protocolVersion: string;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    opts?: AcpClientOptions,
  ) {
    super();
    this.clientName = opts?.clientName ?? "wanwu-acp-client";
    this.clientVersion = opts?.clientVersion ?? "1.0.0-beta";
    this.protocolVersion = opts?.protocolVersion ?? "0.1.0-wanwu";
    this.rl = readline.createInterface({ input: child.stdout });
    this.rl.on("line", (line) => this.onLine(line));
    child.stderr.on("data", (buf: Buffer) => {
      this.emit("notification", "stderr", buf.toString("utf8"));
    });
    child.on("exit", (code) => this.emit("exit", code));
    child.on("error", (err) => this.emit("error", err));
  }

  private onLine(line: string): void {
    if (!line.trim()) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (
      typeof msg.id === "number" &&
      !("method" in msg) &&
      (msg.result !== undefined || msg.error !== undefined)
    ) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        const e = msg.error as { message?: string };
        pending.reject(new Error(e.message ?? "ACP error"));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    if (typeof msg.method === "string" && msg.id !== undefined) {
      if (msg.method === "session/request_permission") {
        const params = (msg.params ?? {}) as {
          toolCall?: { title?: string; rawInput?: string };
          verdict?: { risk?: string; reason?: string };
        };
        const req: AcpPermissionRequest = {
          id: Number(msg.id),
          toolName: params.toolCall?.title ?? "Tool",
          summary: params.toolCall?.rawInput ?? params.verdict?.reason ?? "permission required",
          risk: params.verdict?.risk,
        };
        this.emit("permission", req);
        return;
      }
      this.emit("notification", msg.method, msg.params);
      return;
    }

    if (typeof msg.method === "string") {
      this.emit("notification", msg.method, msg.params);
      const tool = extractTool(msg.params);
      if (tool) {
        this.emit("tool", tool);
      }
      const edit = extractEdit(msg.params);
      if (edit) {
        this.emit("edit", edit);
      }
      const text = extractText(msg.params);
      if (text) {
        this.emit("message", text);
      }
    }
  }

  respond(id: number, result: unknown): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`, (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  async initialize(): Promise<unknown> {
    return this.request("initialize", {
      protocolVersion: this.protocolVersion,
      clientInfo: { name: this.clientName, version: this.clientVersion },
    });
  }

  async newSession(cwd?: string): Promise<string> {
    const result = (await this.request("session/new", { cwd: cwd ?? process.cwd() })) as {
      sessionId?: string;
    };
    return result.sessionId ?? "unknown";
  }

  async loadSession(sessionId: string): Promise<{ sessionId: string; history?: unknown[] }> {
    const result = (await this.request("session/load", { sessionId })) as {
      sessionId?: string;
      history?: unknown[];
    };
    return { sessionId: result.sessionId ?? sessionId, history: result.history };
  }

  async cancelSession(sessionId?: string): Promise<void> {
    await this.request("session/cancel", sessionId ? { sessionId } : {});
  }

  async prompt(sessionId: string, text: string): Promise<unknown> {
    return this.request("session/prompt", { sessionId, prompt: text, text });
  }

  dispose(): void {
    this.rl?.close();
    if (!this.child.killed) {
      this.child.kill();
    }
  }
}

function extractText(params: unknown): string | undefined {
  if (!params || typeof params !== "object") return undefined;
  const p = params as Record<string, unknown>;
  const update = p.update as Record<string, unknown> | undefined;
  const content = update?.content as Record<string, unknown> | undefined;
  const text = content?.text;
  return typeof text === "string" ? text : undefined;
}

function extractTool(params: unknown): { title: string; status: string; detail?: string } | undefined {
  if (!params || typeof params !== "object") return undefined;
  const p = params as Record<string, unknown>;
  const update = p.update as Record<string, unknown> | undefined;
  if (update?.sessionUpdate !== "tool_call") return undefined;
  const title = update.title;
  const status = update.status;
  const content = update.content as Record<string, unknown> | undefined;
  const detail = content?.text;
  if (typeof title !== "string" || typeof status !== "string") return undefined;
  return {
    title,
    status,
    detail: typeof detail === "string" ? detail.slice(0, 200) : undefined,
  };
}

function extractEdit(params: unknown): AcpEditProposal | undefined {
  if (!params || typeof params !== "object") return undefined;
  const p = params as Record<string, unknown>;
  const update = p.update as Record<string, unknown> | undefined;
  if (update?.sessionUpdate !== "tool_call") return undefined;
  const content = update.content as Record<string, unknown> | undefined;
  if (content?.type !== "diff") return undefined;
  const path = content.path;
  const before = content.before;
  const after = content.after;
  if (typeof path !== "string" || typeof before !== "string" || typeof after !== "string") {
    return undefined;
  }
  return { path, before, after };
}
