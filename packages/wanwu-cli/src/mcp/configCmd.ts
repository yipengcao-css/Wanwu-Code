import * as readline from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { findWorkspaceRoot } from "../workspaceRoot.js";
import { loadMcpServers } from "./loadConfig.js";
import type { McpServerConfig } from "./types.js";

function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => resolve(answer.trim()));
  });
}

function mcpTomlPath(cwd: string): string {
  return join(cwd, ".wanwu", "mcp.toml");
}

function readExisting(cwd: string): Record<string, unknown> {
  const path = mcpTomlPath(cwd);
  if (!existsSync(path)) return {};
  return parseToml(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function writeServer(cwd: string, name: string, server: McpServerConfig): void {
  const path = mcpTomlPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  const existing = readExisting(cwd);
  const mcp = (existing.mcp as Record<string, unknown> | undefined) ?? {};
  const servers = (mcp.servers as Record<string, unknown> | undefined) ?? {};
  servers[name] = {
    command: server.command,
    args: server.args,
    ...(server.env ? { env: server.env } : {}),
  };
  mcp.servers = servers;
  existing.mcp = mcp;
  writeFileSync(path, stringifyToml(existing), "utf8");
}

function removeServer(cwd: string, name: string): boolean {
  const path = mcpTomlPath(cwd);
  if (!existsSync(path)) return false;
  const existing = readExisting(cwd);
  const mcp = existing.mcp as Record<string, unknown> | undefined;
  const servers = mcp?.servers as Record<string, unknown> | undefined;
  if (!servers || !(name in servers)) return false;
  delete servers[name];
  writeFileSync(path, stringifyToml(existing), "utf8");
  return true;
}

export async function runMcpConfigCommand(args: string[]): Promise<number> {
  const cwd = findWorkspaceRoot();
  const [sub, ...rest] = args;

  switch (sub) {
    case "list": {
      const { servers, source } = loadMcpServers(cwd);
      print(JSON.stringify({ source, servers }, null, 2));
      return 0;
    }
    case "add": {
      const name = rest[0];
      if (!name) {
        console.error("wanwu mcp-config add <name>");
        return 2;
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        const command = await question(rl, "command: ");
        const argsRaw = await question(rl, "args (space separated): ");
        const envRaw = await question(rl, "env KEY=VAL (comma separated, optional): ");
        if (!command) {
          print("command 不能为空");
          return 1;
        }
        const args = argsRaw ? argsRaw.split(/\s+/).filter(Boolean) : [];
        const env: Record<string, string> = {};
        if (envRaw) {
          for (const pair of envRaw.split(",")) {
            const [k, v] = pair.split("=");
            if (k && v) env[k.trim()] = v.trim();
          }
        }
        writeServer(cwd, name, { name, command, args, env: Object.keys(env).length ? env : undefined });
        print(`已添加 MCP server：${name}`);
        return 0;
      } finally {
        rl.close();
      }
    }
    case "remove": {
      const name = rest[0];
      if (!name) {
        console.error("wanwu mcp-config remove <name>");
        return 2;
      }
      const removed = removeServer(cwd, name);
      print(removed ? `已移除 ${name}` : `未找到 ${name}`);
      return removed ? 0 : 1;
    }
    default:
      print(`wanwu mcp-config — 对话式 MCP 配置

Usage:
  wanwu mcp-config list
  wanwu mcp-config add <name>
  wanwu mcp-config remove <name>
`);
      return sub ? 2 : 0;
  }
}
