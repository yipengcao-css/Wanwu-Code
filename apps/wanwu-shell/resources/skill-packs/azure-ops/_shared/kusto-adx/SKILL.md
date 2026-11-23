---
name: kusto-adx
description: 查询/探测 21Vianet 中国区 Azure Data Explorer (ADX / Kusto) 集群：先读共享集群清单确认 cluster + database，优先走 kusto-mcp 的 MCP 工具，MCP 不可用时用 _shared/scripts 下的 token/查询脚本回退；包含 401/403/可见库为空的判定方法。
---

# kusto-adx

本技能本身不含集群清单，**唯一的集群/默认库来源是同级共享目录 `_shared`**（不要凭记忆写集群名）。

```
skills/
├── _shared/                 <- 共享资产（唯一事实来源）
│   ├── clusters.json        <- 19 个集群 {KUSTO_CLUSTER_URL, KUSTO_DEFAULT_DATABASE}
│   ├── get_kusto_token.py
│   ├── gen_mcp_servers.cjs  <- 由 clusters.json 生成 mcp.servers.generated.json
│   ├── mcp.servers.generated.json
│   ├── verify-kusto-mcp.mjs / verify-server.mjs
│   └── scripts/
│       ├── query-adx.py           <- 单次查询（MCP 不可用时的回退）
│       ├── kusto_probe.py         <- 全集群批量探测（query + mgmt）
│       ├── probe_kusto_access.py  <- 全集群批量探测（带判定说明）
│       └── kusto_dbscan.py        <- 全集群扫可见库 / 表数量
└── kusto-adx/SKILL.md       <- 本文件
```

绝对路径（工作目录不在 `skills/` 下时用）：
`C:\Users\cao.yipeng\Desktop\skills\$WANWU_SKILLS_ROOT\_shared`

## 使用顺序

1. **读清单**：`Read ../_shared/clusters.json`（拿到 `KUSTO_CLUSTER_URL` + `KUSTO_DEFAULT_DATABASE`）。
   URL 主机名首段即 MCP server 短名：`https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn`
   → `kusto-mabprodmcadx`，工具前缀 `kusto-mabprodmcadx__*`。
2. **首选 MCP 工具**（`mcp.servers.generated.json` 已按集群生成，认证方式 `azure-cli`）：
   `kusto-<short>__execute-query`，不需要手动取 token。
3. **MCP 不可用才回退脚本**（先 `az login` 且 `az cloud set --name AzureChinaCloud`）。
   以下命令在 `C:\Users\cao.yipeng\Desktop\skills` 目录下执行（即 `skills\` 的上一级）：

```powershell
# 1) 取 token（code:0 有效；code:1 → 让用户重新 az login，别继续查）
python $WANWU_SKILLS_ROOT\_shared\get_kusto_token.py https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn
# 2) 查询（KQL 含 | 和 $，PowerShell 用单引号包裹；.show 开头脚本自动走 /v1/rest/mgmt）
python $WANWU_SKILLS_ROOT\_shared\scripts\query-adx.py https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn MABKustoProd '.show tables' "<token>"
# 3) 批量探测 / 扫库（不需要手动传 token，脚本内部 az 取）
python $WANWU_SKILLS_ROOT\_shared\scripts\kusto_probe.py --mgmt
python $WANWU_SKILLS_ROOT\_shared\scripts\kusto_dbscan.py https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn
```

MCP 依赖的是 `kusto-mcp` 包路径（写死在 `gen_mcp_servers.cjs` 的 `KUSTO_MCP_INDEX`），换机器需改；改完跑：

```powershell
node $WANWU_SKILLS_ROOT\_shared\gen_mcp_servers.cjs        # 重新生成 mcp.servers.generated.json
node $WANWU_SKILLS_ROOT\_shared\verify-kusto-mcp.mjs --list   # 只校验清单解析，不联网
```

## 结果判定

| 现象 | 含义 | 下一步 |
| --- | --- | --- |
| HTTP 200 | 认证 + 授权通过 | 正常查 |
| HTTP 401 | token 不被该集群接受（租户/身份未授权） | 确认 `az cloud set --name AzureChinaCloud`，换正确账号登录 |
| HTTP 403 | 已认证，但无该 database 权限（`UnauthorizedDatabaseAccessException`） | `.show databases` 换库，或让用户申请权限 |
| mgmt 200 且 `"Rows": []` | 已认证，但对该集群**没有任何可见库** | 报告"无可见库"，不要猜库名 |

## 硬性约束

- **绝不打印、回显或落盘 token 本体**；用完即弃，日志里只写"token 有效/无效"。
- 集群名、数据库名一律从 `clusters.json` 取，禁止编造；清单里没有的集群先问用户。
- 查询默认带时间范围（`| where Timestamp > ago(1h)`），避免全表扫描导致超时；脚本超时 10s 建连 / 600s 读取。
- 大批量探测先跑 `kusto_probe.py --mgmt`（每个集群 1 次请求），不要逐库逐表暴力扫。
