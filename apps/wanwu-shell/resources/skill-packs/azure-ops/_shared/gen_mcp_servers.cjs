#!/usr/bin/env node
/*
 * gen_mcp_servers.cjs - generate OpenClaw `mcp.servers` entries for kusto-mcp
 * from the shared cluster registry (clusters.json).
 *
 * Usage:
 *     node $WANWU_SKILLS_ROOT/_shared/gen_mcp_servers.cjs
 *
 * Input : $WANWU_SKILLS_ROOT/_shared/clusters.json
 *         (array of { "KUSTO_CLUSTER_URL": "...", "KUSTO_DEFAULT_DATABASE": "..." })
 * Output: $WANWU_SKILLS_ROOT/_shared/mcp.servers.generated.json
 *         ({ "mcp": { "servers": { "kusto-<short>": { command, args, env } } } })
 *
 * Every generated server gets the same env template:
 *   KUSTO_CLUSTER_URL      -> per cluster (from registry)
 *   KUSTO_DEFAULT_DATABASE -> per cluster (from registry; enables auto-connect, no initialize)
 *   KUSTO_AUTH_METHOD      -> "azure-cli" (read az login cache; deterministic & fast)
 *
 * Naming: kusto-<short> where <short> = first hostname label
 *         -> tool prefix kusto-<short>__* (e.g. kusto-mabprodmcadx__execute-query)
 */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const SRC = path.join(HERE, "clusters.json");
const OUT = path.join(HERE, "mcp.servers.generated.json");

const KUSTO_MCP_INDEX =
  "C:\\Users\\cao.yipeng\\AppData\\Roaming\\npm\\node_modules\\kusto-mcp\\dist\\index.js";

// --- auth env injected for every server (single place, never hand-copied) ---
const AUTH_ENV = { KUSTO_AUTH_METHOD: "azure-cli" };

const clusters = JSON.parse(fs.readFileSync(SRC, "utf8"));

const servers = {};
for (const c of clusters) {
  const url = c.KUSTO_CLUSTER_URL;
  const db = c.KUSTO_DEFAULT_DATABASE;
  const short = new URL(url).hostname.split(".")[0];

  const env = { KUSTO_CLUSTER_URL: url };
  if (db) env.KUSTO_DEFAULT_DATABASE = db;
  Object.assign(env, AUTH_ENV); // inject auth env

  servers["kusto-" + short] = {
    command: "node",
    args: [KUSTO_MCP_INDEX],
    env,
  };
}

const out = { mcp: { servers } };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log("registry entries:", clusters.length);
console.log("servers generated:", Object.keys(servers).length);
console.log("wrote:", OUT);
