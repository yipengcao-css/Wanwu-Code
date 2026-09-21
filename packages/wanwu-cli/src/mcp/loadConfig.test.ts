import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadMcpServers,
  parseQualifiedMcpTool,
  qualifyMcpTool,
} from "./loadConfig.js";

describe("mcp loadConfig", () => {
  it("loads .wanwu/mcp.json (Cursor-style)", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-mcp-json-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          echo: { command: "node", args: ["echo.js"] },
        },
      }),
      "utf8",
    );
    const { servers, source } = loadMcpServers(root);
    expect(source).toContain("mcp.json");
    expect(servers).toHaveLength(1);
    expect(servers[0]?.name).toBe("echo");
    expect(servers[0]?.command).toBe("node");
  });

  it("loads .wanwu/mcp.toml preferentially", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-mcp-toml-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "mcp.toml"),
      `[mcp.servers.fs]\ncommand = "npx"\nargs = ["-y", "x"]\n`,
      "utf8",
    );
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({ mcpServers: { other: { command: "false" } } }),
      "utf8",
    );
    const { servers, source } = loadMcpServers(root);
    expect(source).toContain("mcp.toml");
    expect(servers.map((s) => s.name)).toEqual(["fs"]);
  });

  it("loads HTTP MCP servers from url", () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-mcp-http-cfg-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          slack: {
            url: "https://mcp.example.test/mcp",
            oauth: {
              authorization_url: "https://example.test/authorize",
              token_url: "https://example.test/token",
              client_id: "cid",
            },
          },
        },
      }),
      "utf8",
    );
    const { servers } = loadMcpServers(root);
    expect(servers[0]?.url).toBe("https://mcp.example.test/mcp");
    expect(servers[0]?.transport).toBe("http");
    expect(servers[0]?.oauth?.clientId).toBe("cid");
  });

  it("qualifies tool names", () => {
    expect(qualifyMcpTool("my-server", "list_files")).toBe("mcp__my-server__list_files");
    expect(parseQualifiedMcpTool("mcp__my-server__list_files")).toEqual({
      server: "my-server",
      tool: "list_files",
    });
  });
});
