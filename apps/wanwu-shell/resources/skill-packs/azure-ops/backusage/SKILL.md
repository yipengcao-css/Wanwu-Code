---
name: backusage
description: "分析 Azure 备份保管库及 VM/SQL/workload 备份项消耗的备份存储空间（中国区 MAB ADX）。"
homepage: https://learn.microsoft.com/en-us/azure/backup/
---

# 备份存储用量分析

分析 Azure Recovery Services 保管库及其备份项消耗的备份存储空间。
默认口径：**最近 24 小时的平均用量**（与 Azure 门户显示的保管库存储用量一致）。

## 数据源

- cluster: `https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn`
- database: `MABKustoProd`
- 主表: `AzureBackupReportingData`（列结构见 references/queries.md）
- 仅覆盖中国区 Azure (Mooncake) 的 MAB 备份集群。

## 执行流程（token 预检 → MCP 优先 → 脚本兜底）

**0. 预检 token（每次任务首次查询前，只查一个集群）**

```powershell
python $WANWU_SKILLS_ROOT/_shared/get_kusto_token.py https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn
```

- 输出 `code: 0` → 登录有效，继续；**顺手留着这个 token 给第 2 步兜底复用**。
- 输出 `code: 1` → **立即终止，不做任何查询**；直接告诉用户：**Azure CLI 登录已失效，请重新 `az login`**，登录完再让我重试。
- 只查**一个**集群即可：az 登录缓存是全局的，一个能过 → 全部能过。

**1. 建查询**：从 references/queries.md 选模板，替换参数（时间/资源 ID 见「参数获取」）。

**2. 走 kusto MCP**（连接 + 执行；主路径 = 单 server）

- **单 server `kusto-mcp`（本部署有意只注册这一个，无默认库）**：先
  `kusto-mcp__initialize-connection(cluster_url, database)` 连目标集群（参数取自
  `$WANWU_SKILLS_ROOT/_shared/clusters.json`），再 `kusto-mcp__execute-query(query, limit)`；
  **每次切换集群或库都必须重新 initialize**（连接是进程级的）。
- 报 `Connection not initialized` → 漏连或连接被重置，补一次 `initialize-connection`（幂等）后重试原查询。
  MCP 持续报错 → 走第 3 步兜底。

**3. MCP 调用失败 → 回退 `query-adx.py`**

- **触发条件**：MCP 工具未注册 / 连接报错 / 查询返回错误 / 超时。
- 用第 0 步拿到的 token（若已过期就重取）：
  ```powershell
  python $WANWU_SKILLS_ROOT/_shared/scripts/query-adx.py <cluster> <database> "<KQL>" <token>
  ```
- KQL 用**单引号整体**传入；返回 `code: 1` → 同第 0 步，让用户 `az login`。
- **不要把 token 回显到最终答案**。

**4. 复核**：给出结论，并附上实际使用的 KQL 与关键数据行作为依据，不编造数据。

> **为何优先 MCP**（实测）：常驻进程复用连接与 token，单次查询 ~0.8s；回退脚本每次要先
> `az` 取 token（~2s）再起 python 进程，单次 ~2.7s。且 MCP 返回压缩/限行的 JSON，更省上下文。

## 集群清单与配置生成（运维参考，非运行时路径）

- **集群清单（唯一事实来源）**：`$WANWU_SKILLS_ROOT/_shared/clusters.json`（19 个集群，`KUSTO_CLUSTER_URL` + `KUSTO_DEFAULT_DATABASE`）。
  token 预检白名单、`initialize-connection` 的 cluster/database 参数都从这里取。
- **本部署有意只注册单 `kusto-mcp`**（多 skill 共享）：避免 N 个集群 × N 个常驻进程，以及上百个同类工具
  进入上下文互相干扰。因此运行时**始终需要 initialize 切库**。
- **配置生成器**：`$WANWU_SKILLS_ROOT/_shared/gen_mcp_servers.cjs` 从清单生成 `mcp.servers` 条目
  （`$WANWU_SKILLS_ROOT/_shared/mcp.servers.generated.json`，env 统一注入 `KUSTO_AUTH_METHOD=azure-cli`，永不手抄）。
  集群连接变更时只改 clusters.json 并重跑生成器；如需把生成条目合入 openclaw.json（需重启 Gateway），
  按需挑选、不要全量合入；这类带默认库的 server 冷启动后头 ~6-10s 首查会报 `Connection not initialized`，等 2-3s 重试即可。

> 兜底路径与 token 预检的完整步骤见「执行流程」第 0 / 3 步。

## 关键口径与陷阱（务必遵守）

- **口径 = 近期（默认 24h）均值**：`avg(StorageConsumedInMBs)`。不要用基线(min)、峰值(max)，也不要跨采样点求和。
- **值是 JSON 字符串里的字符串**：`properties` 是字符串，`StorageConsumedInMBs` 也是字符串 →
  必须 `parse_json(properties)` 后 `toreal(tostring(p.StorageConsumedInMBs))`。
- **镜像 category 去重**：同一采样点会在 `AzureBackupReport` 与 `AddonAzureBackupStorage` 各存一份 →
  求和会翻倍。过滤 `category == "AzureBackupReport"`。（求均值不受精确重复影响，但仍建议保留过滤。）
- **必须带时间过滤**：主表有近两年历史，无过滤会超时并撑爆上下文。
- **时间列可能为空**：聚合前 `where isnotnull(PreciseTimeStamp)`，否则报 `DateTime.Ticks must not be negative`。
- **时间为 UTC+0**：用户提问若为非 UTC 时间，先换算。
- **`resourceId` 是大写全路径**（`/SUBSCRIPTIONS/.../VAULTS/<name>`）：用 `contains`/`has` 匹配，勿用 `==`。
- **本 MCP 下的已知坑**：避开用 `arg_max/arg_min` 取"最后值"（返回列错位）、避开 `round()`（报 SEM0201）；
  `split(...)` 结果是 dynamic，分组前先 `tostring()`。

## 参数获取

| 参数 | 说明 | 来源 |
|---|---|---|
| `_startTime` / `_endTime` | 时间范围（UTC） | 用户描述；缺省用近 24h |
| `_RSVID` | 保管库资源 ID 或保管库名 | 用户输入，匹配时用 `contains` |

- `_RSVID` 为必需项；时间缺省近 24h。
- 意图模糊（未指定具体 VM / 备份项）：直接查整库汇总，再按需下钻。

## 使用场景

✅ VM / SQL / workload 备份存储用量、"为什么备份存储这么高"、用量异常增长排查、月度用量、与门户核对。
❌ 非 Azure 备份问题；VM 本机磁盘用量（非备份存储）。

## 参考

- KQL 模板、字段语义、结构自探测查询：references/queries.md
- token 预检：`$WANWU_SKILLS_ROOT/_shared/get_kusto_token.py <cluster>`（`code: 1` = 需重新 `az login`）
- 回退脚本：$WANWU_SKILLS_ROOT/_shared/scripts/query-adx.py（不含任何内置 token）
