export type McpTransport = "stdio" | "http" | "sse";

export type McpOAuthConfig = {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  /** Secret is read from this env var — never stored in the repo config. */
  clientSecretEnv?: string;
  scope?: string;
};

export type McpServerConfig = {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** Streamable HTTP / SSE endpoint (when set, stdio is not used). */
  url?: string;
  transport?: McpTransport;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig;
};

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpListedTool = McpTool & {
  server: string;
  /** Exposed to the LLM as mcp__<server>__<tool> */
  qualifiedName: string;
};

export type McpResource = {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  server: string;
};

export interface McpClient {
  readonly name: string;
  start(): Promise<void>;
  listTools(): Promise<McpTool[]>;
  listResources(): Promise<Array<{ uri: string; name?: string; description?: string; mimeType?: string }>>;
  readResource(uri: string): Promise<string>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  dispose(): void;
}
