import type { ToolSpec } from "@wanwu/providers";
import { McpStdioClient } from "./client.js";
import {
  loadMcpServers,
  qualifyMcpTool,
} from "./loadConfig.js";
import type { McpListedTool, McpServerConfig } from "./types.js";

export interface McpRegistryOptions {
  workspaceRoot: string;
  /** Override config discovery (tests). */
  servers?: McpServerConfig[];
}

/**
 * Owns stdio MCP clients for a workspace session.
 * Tool names are namespaced: mcp__&lt;server&gt;__&lt;tool&gt;
 */
export class McpRegistry {
  private readonly clients = new Map<string, McpStdioClient>();
  private readonly tools = new Map<string, McpListedTool>();
  private started = false;

  constructor(private readonly opts: McpRegistryOptions) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const servers =
      this.opts.servers ?? loadMcpServers(this.opts.workspaceRoot).servers;

    for (const cfg of servers) {
      const client = new McpStdioClient(cfg);
      try {
        await client.start();
        const listed = await client.listTools();
        this.clients.set(cfg.name, client);
        for (const t of listed) {
          const qualifiedName = qualifyMcpTool(cfg.name, t.name);
          this.tools.set(qualifiedName, {
            ...t,
            server: cfg.name,
            qualifiedName,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[wanwu mcp] failed to start server "${cfg.name}": ${msg}`);
        client.dispose();
      }
    }
  }

  listTools(): McpListedTool[] {
    return [...this.tools.values()];
  }

  /** OpenAI-compat tool specs for the LLM loop. */
  listToolSpecs(): ToolSpec[] {
    return this.listTools().map((t) => ({
      name: t.qualifiedName,
      description: `[MCP:${t.server}] ${t.description ?? t.name}`,
      parameters: t.inputSchema ?? { type: "object", properties: {} },
    }));
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const meta = this.tools.get(name);
    if (!meta) {
      throw new Error(`unknown MCP tool: ${name}`);
    }
    const client = this.clients.get(meta.server);
    if (!client) {
      throw new Error(`MCP server not running: ${meta.server}`);
    }
    return client.callTool(meta.name, args);
  }

  dispose(): void {
    for (const c of this.clients.values()) c.dispose();
    this.clients.clear();
    this.tools.clear();
    this.started = false;
  }
}

/** Process-wide registry keyed by workspace (ACP long-lived process). */
const registries = new Map<string, McpRegistry>();

export async function ensureMcpRegistry(
  workspaceRoot: string,
  opts?: { servers?: McpServerConfig[] },
): Promise<McpRegistry> {
  const existing = registries.get(workspaceRoot);
  if (existing) return existing;
  const reg = new McpRegistry({ workspaceRoot, servers: opts?.servers });
  await reg.start();
  registries.set(workspaceRoot, reg);
  return reg;
}

export function peekMcpRegistry(workspaceRoot: string): McpRegistry | undefined {
  return registries.get(workspaceRoot);
}

export function disposeMcpRegistry(workspaceRoot: string): void {
  const reg = registries.get(workspaceRoot);
  if (!reg) return;
  reg.dispose();
  registries.delete(workspaceRoot);
}
