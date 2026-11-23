// Verify a generated mcp.servers entry actually works: spawn -> auto-connect -> query
import { spawn } from "node:child_process";
import { Client } from "file:///C:/Users/cao.yipeng/AppData/Roaming/npm/node_modules/kusto-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "file:///C:/Users/cao.yipeng/AppData/Roaming/npm/node_modules/kusto-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { readFileSync } from "node:fs";

const name = process.argv[2] || "kusto-armmcadx";
const q = process.argv[3] || ".show version";
const cfg = JSON.parse(readFileSync(new URL("./mcp.servers.generated.json", import.meta.url), "utf8"));
const entry = cfg.mcp.servers[name];
if (!entry) { console.error("server not found:", name); process.exit(2); }

const transport = new StdioClientTransport({
  command: entry.command,
  args: entry.args,
  env: { ...process.env, ...entry.env },
});
const client = new Client({ name: "verify", version: "0.0.1" });
const t0 = Date.now();
await client.connect(transport);
console.log(`[${name}] connected in ${Date.now() - t0}ms`);

// retry until fire-and-forget auto-connect finishes (max ~40s)
let text = "", ok = false, attempts = 0;
while (Date.now() - t0 < 40000) {
  attempts++;
  const res = await client.callTool({ name: "execute-query", arguments: { query: q, limit: 1 } });
  text = res.content?.[0]?.text ?? "";
  ok = !res.isError && !text.includes("Connection not initialized");
  if (ok) break;
  await new Promise((r) => setTimeout(r, 2000));
}
console.log(`[${name}] query ${ok ? "OK" : "FAILED"} after ${attempts} attempts in ${Date.now() - t0}ms`);
console.log(text.slice(0, 400));
await client.close();
process.exit(ok ? 0 : 1);

