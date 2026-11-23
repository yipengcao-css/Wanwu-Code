#!/usr/bin/env node
// 验证 kusto-mcp 能否连接 clusters.json 里的每个集群。
// 完全复刻 kusto-mcp 的连接逻辑：azure-kusto-data + withAzLoginIdentity + 跑 print now() 探活。
// 用法：
//   node verify-kusto-mcp.mjs                      # 用默认共享文件里的集群
//   node verify-kusto-mcp.mjs <path/to/clusters.json>   # 指定集群清单
//   node verify-kusto-mcp.mjs --list               # 只列集群，不联网（自查脚本/模块加载是否正常）
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 从 kusto-mcp 已安装的 node_modules 里解析 azure-kusto-data（与 kusto-mcp 同一份依赖）
const kustoMcpPkg = 'C:/Users/cao.yipeng/AppData/Roaming/npm/node_modules/kusto-mcp/package.json';
if (!existsSync(kustoMcpPkg)) {
  console.error('[x] 找不到 kusto-mcp 包：' + kustoMcpPkg);
  process.exit(2);
}
const require = createRequire(kustoMcpPkg);
const { Client, ClientRequestProperties, KustoConnectionStringBuilder } = require('azure-kusto-data');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLUSTERS = '"C:\Users\cao.yipeng\Desktop\skills\$WANWU_SKILLS_ROOT\_shared\clusters.json"';

function loadClusters() {
  const arg = process.argv[2];
  let file;
  if (arg && arg !== '--list') file = arg;
  else if (existsSync(DEFAULT_CLUSTERS)) file = DEFAULT_CLUSTERS;
  else file = join(__dirname, 'clusters.json');
  if (!existsSync(file)) {
    console.error('[x] 找不到集群清单：' + file);
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const clusters = raw.map((c) => ({ url: c.KUSTO_CLUSTER_URL, db: c.KUSTO_DEFAULT_DATABASE }));
  console.log(`[i] 集群清单：${file}（共 ${clusters.length} 个）\n`);
  return clusters;
}

// 与 kusto-mcp 的 classifyConnectionFailure 一致的粗略分类
function classify(err) {
  if (err?.name === 'KustoAuthenticationError') return '认证失败(auth)';
  const status = err?.response?.status ?? err?.response?.statusCode;
  if (status === 401 || status === 403) return `鉴权拒绝(authz ${status})`;
  if (status === 429) return '被限流(429)';
  if (status >= 500) return `服务器错误(HTTP ${status})`;
  if (status >= 400) return `请求错误(HTTP ${status})`;
  const codes = [err?.code, err?.cause?.code].filter(Boolean);
  for (const code of codes) {
    if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return `域名解析失败(${code})`;
    if (code === 'ECONNREFUSED') return '连接被拒绝';
    if (['ETIMEDOUT', 'ECONNABORTED'].includes(code)) return '连接超时';
    if (/CERT|_SSL|_SIGN|TLS/i.test(code)) return `TLS/证书问题(${code})`;
  }
  if (codes.includes('ERR_NETWORK')) return '网络错误';
  const msg = (err?.message || String(err)).slice(0, 120);
  if (/timed out|timeout/i.test(msg)) return '连接超时';
  return `其他错误: ${msg}`;
}

async function testCluster(cluster, timeoutMs) {
  const conn = KustoConnectionStringBuilder.withAzLoginIdentity(cluster.url);
  const client = new Client(conn);
  const props = new ClientRequestProperties();
  props.setClientTimeout(timeoutMs);
  const t0 = Date.now();
  await client.execute(cluster.db, 'print now()', props); // 与 kusto-mcp initialize() 相同的探活查询
  return Date.now() - t0;
}

const clusters = loadClusters();
if (process.argv[2] === '--list') {
  for (const c of clusters) console.log(`  ${c.url}  ->  ${c.db}`);
  console.log('\n[ok] 模块加载与清单解析正常。要真正联网测试，去掉 --list 再运行。');
  process.exit(0);
}

const timeoutMs = parseInt(process.env.KUSTO_CONNECTION_TIMEOUT || '20000', 10);
let pass = 0, fail = 0;
console.log('集群地址                                                           数据库          结果\n' + '-'.repeat(90));
for (const c of clusters) {
  try {
    const ms = await testCluster(c, timeoutMs);
    pass++;
    console.log(`${c.url.padEnd(67)} ${c.db.padEnd(12)} OK  (${ms}ms)`);
  } catch (e) {
    fail++;
    console.log(`${c.url.padEnd(67)} ${c.db.padEnd(12)} 失败  ${classify(e)}`);
  }
}
console.log('-'.repeat(90));
console.log(`\n[结果] 成功 ${pass} / 失败 ${fail}（共 ${clusters.length}）`);
console.log('提示：失败时先确认 ① az login 已登录且 ② az cloud set --name AzureChinaCloud 已切到中国区云。');
process.exit(fail > 0 ? 1 : 0);
