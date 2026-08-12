import type { LspDiagnosticsPayload, LspServerDef } from "./types.js";
import { BUILTIN_LSP_SERVERS, serverForLanguage } from "./registry.js";
import { loadLspServers } from "./loadLspConfig.js";
import { resolveLspServer } from "./resolveServer.js";
import { StdioLspClient } from "./stdioLspClient.js";
import { languageIdFor } from "./uri.js";

export type LspSessionManagerOptions = {
  workspaceRoot: string;
  onDiagnostics: (payload: LspDiagnosticsPayload) => void;
  onError?: (message: string) => void;
  /** Override built-in registry (tests). */
  servers?: LspServerDef[];
};

/**
 * Owns one StdioLspClient per server id for a workspace.
 * Routes documents by languageId → server.
 */
export class LspSessionManager {
  private readonly clients = new Map<string, StdioLspClient>();
  private readonly servers: LspServerDef[];
  private readonly starting = new Map<string, Promise<StdioLspClient | undefined>>();

  constructor(private readonly opts: LspSessionManagerOptions) {
    const custom = loadLspServers(opts.workspaceRoot).servers;
    const builtins = opts.servers ?? BUILTIN_LSP_SERVERS;
    const byId = new Map<string, LspServerDef>();
    for (const s of builtins) byId.set(s.id, s);
    for (const s of custom) byId.set(s.id, s);
    this.servers = [...byId.values()];
  }

  listServers(): LspServerDef[] {
    return this.servers.slice();
  }

  serverForPath(relPath: string): LspServerDef | undefined {
    const lang = languageIdFor(relPath);
    return serverForLanguage(lang, this.servers);
  }

  async ensureForPath(relPath: string): Promise<StdioLspClient | undefined> {
    const def = this.serverForPath(relPath);
    if (!def) return undefined;
    return this.ensureServer(def.id);
  }

  async ensureServer(serverId: string): Promise<StdioLspClient | undefined> {
    const existing = this.clients.get(serverId);
    if (existing) return existing;
    const pending = this.starting.get(serverId);
    if (pending) return pending;

    const def = this.servers.find((s) => s.id === serverId);
    if (!def) return undefined;

    const promise = (async () => {
      const launch = resolveLspServer(def);
      if (!launch) {
        this.opts.onError?.(`LSP server 不可用：${def.id}（${def.command}）`);
        return undefined;
      }
      const client = new StdioLspClient({
        workspaceRoot: this.opts.workspaceRoot,
        serverId: def.id,
        launch,
        onDiagnostics: this.opts.onDiagnostics,
        onError: this.opts.onError,
      });
      try {
        await client.start();
        this.clients.set(def.id, client);
        return client;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.opts.onError?.(`LSP 启动失败 ${def.id}：${msg}`);
        client.dispose();
        return undefined;
      } finally {
        this.starting.delete(serverId);
      }
    })();

    this.starting.set(serverId, promise);
    return promise;
  }

  async didOpen(relPath: string, text: string): Promise<boolean> {
    const client = await this.ensureForPath(relPath);
    if (!client) return false;
    await client.didOpen(relPath, text);
    return true;
  }

  async didChange(relPath: string, text: string): Promise<boolean> {
    const def = this.serverForPath(relPath);
    if (!def) return false;
    const client = this.clients.get(def.id);
    if (!client) return false;
    await client.didChange(relPath, text);
    return true;
  }

  async didClose(relPath: string): Promise<boolean> {
    const def = this.serverForPath(relPath);
    if (!def) return false;
    const client = this.clients.get(def.id);
    if (!client) return false;
    await client.didClose(relPath);
    return true;
  }

  dispose(): void {
    for (const c of this.clients.values()) c.dispose();
    this.clients.clear();
    this.starting.clear();
  }
}
