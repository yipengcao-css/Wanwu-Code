import * as readline from "node:readline";
import { findWorkspaceRoot } from "../workspaceRoot.js";
import { readInstalled } from "./cache.js";
import { installPlugin } from "./install.js";
import { fetchRegistry, findPlugin } from "./registry.js";
import { removePlugin } from "./remove.js";
import type { PluginManifest } from "./types.js";

function usage(): void {
  console.log(`wanwu plugin — 插件市场（skills / MCP）

Usage:
  wanwu plugin list [--kind skill|mcp] [--registry <url>]
  wanwu plugin search <query> [--registry <url>]
  wanwu plugin show <id> [--registry <url>]
  wanwu plugin install <id>[@version] [--scope user|workspace] [--yes] [--registry <url>]
  wanwu plugin remove <id> [--scope user|workspace]

Trust:
  official   官方索引，可 --yes 直接安装
  community  社区条目，安装前需确认（显示 command/args）
  local/untrusted  需 --yes 且明确风险
`);
}

function parseIdVersion(raw: string): { id: string; version?: string } {
  const at = raw.lastIndexOf("@");
  if (at > 0) {
    return { id: raw.slice(0, at), version: raw.slice(at + 1) };
  }
  return { id: raw };
}

function trustGate(manifest: PluginManifest, yes: boolean): boolean {
  if (yes) return true;
  if (manifest.trust === "official") return true;
  return false;
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

export async function runPluginCommand(args: string[]): Promise<number> {
  const cwd = findWorkspaceRoot();
  const [sub, ...rest] = args;

  const registryIdx = rest.indexOf("--registry");
  const registry =
    registryIdx >= 0 ? rest[registryIdx + 1] : undefined;
  const yes = rest.includes("--yes");
  const scopeIdx = rest.indexOf("--scope");
  const scope = (scopeIdx >= 0 ? rest[scopeIdx + 1] : "workspace") as "user" | "workspace";
  const kindIdx = rest.indexOf("--kind");
  const kind = kindIdx >= 0 ? rest[kindIdx + 1] : undefined;

  switch (sub) {
    case "list": {
      const index = await fetchRegistry(registry);
      let plugins = index.plugins;
      if (kind) plugins = plugins.filter((p) => p.kind === kind);
      const installed = readInstalled();
      console.log(JSON.stringify({ plugins, installed }, null, 2));
      return 0;
    }
    case "search": {
      const query = rest.find((a) => !a.startsWith("--"));
      if (!query) {
        console.error("wanwu plugin search <query>");
        return 2;
      }
      const index = await fetchRegistry(registry);
      const q = query.toLowerCase();
      const hits = index.plugins.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      );
      console.log(JSON.stringify(hits, null, 2));
      return 0;
    }
    case "show": {
      const raw = rest.find((a) => !a.startsWith("--"));
      if (!raw) {
        console.error("wanwu plugin show <id>");
        return 2;
      }
      const { id, version } = parseIdVersion(raw);
      const index = await fetchRegistry(registry);
      const plugin = findPlugin(index, id, version);
      if (!plugin) {
        console.error(`plugin not found: ${raw}`);
        return 1;
      }
      console.log(JSON.stringify(plugin, null, 2));
      return 0;
    }
    case "install": {
      const raw = rest.find((a) => !a.startsWith("--"));
      if (!raw) {
        console.error("wanwu plugin install <id>[@version]");
        return 2;
      }
      const { id, version } = parseIdVersion(raw);
      const index = await fetchRegistry(registry);
      const manifest = findPlugin(index, id, version);
      if (!manifest) {
        console.error(`plugin not found: ${raw}`);
        return 1;
      }

      if (!trustGate(manifest, yes)) {
        console.log(`即将安装 ${manifest.kind} 插件：${manifest.id}@${manifest.version}`);
        console.log(`trust: ${manifest.trust}`);
        if (manifest.kind === "mcp" && manifest.mcp) {
          console.log(`command: ${manifest.mcp.command} ${manifest.mcp.args.join(" ")}`);
        }
        const ok = await confirm("继续安装？");
        if (!ok) {
          console.log("已取消");
          return 1;
        }
      }

      const record = await installPlugin(manifest, { cwd, scope, yes });
      console.log(JSON.stringify(record, null, 2));
      return 0;
    }
    case "remove": {
      const raw = rest.find((a) => !a.startsWith("--"));
      if (!raw) {
        console.error("wanwu plugin remove <id>");
        return 2;
      }
      const { id } = parseIdVersion(raw);
      const removed = removePlugin(id, { cwd, scope });
      console.log(JSON.stringify({ id, removed }, null, 2));
      return removed ? 0 : 1;
    }
    default:
      usage();
      return sub ? 2 : 0;
  }
}
