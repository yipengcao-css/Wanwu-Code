import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import type { LspDiagnostic, LspDiagnosticsPayload, LspLaunchPlan } from "./types.js";
import {
  languageIdFor,
  mapSeverity,
  pathToUri,
  toWorkspaceRel,
  uriToPath,
} from "./uri.js";

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

export type TsLspClientOptions = {
  workspaceRoot: string;
  launch: LspLaunchPlan;
  onDiagnostics: (payload: LspDiagnosticsPayload) => void;
  onError?: (message: string) => void;
};

/**
 * Minimal LSP client (initialize + textDocument sync + publishDiagnostics).
 * Content-Length framed JSON-RPC over stdio.
 */
export class TsLspClient {
  private child: ChildProcessWithoutNullStreams | undefined;
  private buf = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private initialized = false;
  private readonly openDocs = new Map<string, number>();

  constructor(private readonly opts: TsLspClientOptions) {}

  async start(): Promise<void> {
    if (this.child) return;
    this.child = spawn(this.opts.launch.command, this.opts.launch.args, {
      cwd: this.opts.workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      const msg = chunk.toString("utf8").trim();
      if (msg) this.opts.onError?.(`[tsserver] ${msg.slice(0, 400)}`);
    });
    this.child.on("exit", (code) => {
      this.initialized = false;
      for (const [, p] of this.pending) {
        p.reject(new Error(`typescript-language-server exited (${code})`));
      }
      this.pending.clear();
      this.child = undefined;
    });

    const rootUri = pathToUri(this.opts.workspaceRoot);
    await this.request("initialize", {
      processId: process.pid,
      rootUri,
      rootPath: this.opts.workspaceRoot,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            didSave: false,
            didClose: true,
          },
          publishDiagnostics: { relatedInformation: false },
        },
        workspace: { workspaceFolders: false },
      },
      workspaceFolders: [{ uri: rootUri, name: "wanwu" }],
    });
    this.notify("initialized", {});
    this.initialized = true;
  }

  async didOpen(relPath: string, text: string): Promise<void> {
    if (!this.initialized) await this.start();
    const abs = absFromRel(this.opts.workspaceRoot, relPath);
    const uri = pathToUri(abs);
    this.openDocs.set(uri, 1);
    this.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: languageIdFor(relPath),
        version: 1,
        text,
      },
    });
  }

  async didChange(relPath: string, text: string): Promise<void> {
    if (!this.initialized) return;
    const abs = absFromRel(this.opts.workspaceRoot, relPath);
    const uri = pathToUri(abs);
    const ver = (this.openDocs.get(uri) ?? 0) + 1;
    this.openDocs.set(uri, ver);
    this.notify("textDocument/didChange", {
      textDocument: { uri, version: ver },
      contentChanges: [{ text }],
    });
  }

  async didClose(relPath: string): Promise<void> {
    if (!this.initialized) return;
    const abs = absFromRel(this.opts.workspaceRoot, relPath);
    const uri = pathToUri(abs);
    this.openDocs.delete(uri);
    this.notify("textDocument/didClose", {
      textDocument: { uri },
    });
  }

  dispose(): void {
    try {
      if (this.initialized && this.child) {
        this.notify("exit", undefined);
      }
    } catch {
      /* ignore */
    }
    try {
      this.child?.kill();
    } catch {
      /* ignore */
    }
    this.child = undefined;
    this.initialized = false;
    this.openDocs.clear();
    this.pending.clear();
  }

  private notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.child) {
      return Promise.reject(new Error("LSP server not running"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ jsonrpc: "2.0", id, method, params });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`LSP ${method} timed out`));
        }
      }, 20_000);
    });
  }

  private write(msg: unknown): void {
    const body = JSON.stringify(msg);
    const frame = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
    this.child?.stdin.write(frame);
  }

  private onData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const headerEnd = indexOfHeaderEnd(this.buf);
      if (headerEnd < 0) return;
      const header = this.buf.subarray(0, headerEnd).toString("utf8");
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) {
        this.buf = this.buf.subarray(headerEnd + 4);
        continue;
      }
      const len = Number(m[1]);
      const bodyStart = headerEnd + 4;
      if (this.buf.length < bodyStart + len) return;
      const body = this.buf.subarray(bodyStart, bodyStart + len).toString("utf8");
      this.buf = this.buf.subarray(bodyStart + len);
      this.onMessage(body);
    }
  }

  private onMessage(body: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return;
    }

    if (typeof msg.id === "number" && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) {
        const e = msg.error as { message?: string };
        p.reject(new Error(e.message ?? "LSP error"));
      } else {
        p.resolve(msg.result);
      }
      return;
    }

    if (msg.method === "textDocument/publishDiagnostics") {
      const params = msg.params as {
        uri?: string;
        diagnostics?: Array<{
          message?: string;
          severity?: number;
          source?: string;
          code?: string | number;
          range?: {
            start?: { line?: number; character?: number };
            end?: { line?: number; character?: number };
          };
        }>;
      };
      if (!params?.uri) return;
      const abs = uriToPath(params.uri);
      const rel = toWorkspaceRel(this.opts.workspaceRoot, abs);
      const diagnostics: LspDiagnostic[] = (params.diagnostics ?? []).map((d) => ({
        message: d.message ?? "",
        severity: mapSeverity(d.severity),
        startLine: d.range?.start?.line ?? 0,
        startCharacter: d.range?.start?.character ?? 0,
        endLine: d.range?.end?.line ?? 0,
        endCharacter: d.range?.end?.character ?? 0,
        source: d.source,
        code: d.code,
      }));
      this.opts.onDiagnostics({ path: rel, uri: params.uri, diagnostics });
    }
  }
}

function absFromRel(root: string, rel: string): string {
  return path.join(root, ...rel.split("/"));
}

function indexOfHeaderEnd(buf: Buffer): number {
  for (let i = 0; i + 3 < buf.length; i += 1) {
    if (
      buf[i] === 13 &&
      buf[i + 1] === 10 &&
      buf[i + 2] === 13 &&
      buf[i + 3] === 10
    ) {
      return i;
    }
  }
  return -1;
}
