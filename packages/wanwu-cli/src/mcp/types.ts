export type McpServerConfig = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
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
