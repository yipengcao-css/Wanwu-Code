---
name: azureresourcegraph
description: 通过 Kusto MCP 查询 Azure Data Explorer 集群中 AzureResourceGraph 数据库的 Resources 表，获取 Azure 中国区资源的变更历史记录和配置快照（资源创建/更新/删除、AppGW/LB/VNet 等任意资源类型的 properties 全量 JSON）。用于排障时还原"客户在某个时间点之前把资源改成了什么样"，或分析资源变更频率。
tables:
  - cluster('argmcn2nrpone.chinanorth2').database('AzureResourceGraph').Resources
  - cluster('argmcn2arm1pone.chinanorth2').database('AzureResourceGraph').Resources
---




# 执行前请先预检token是否有效（token 预检 → MCP 优先 → 脚本兜底）

**0. 预检 token（每次任务首次查询前，只查一个集群）**

```powershell
python $WANWU_SKILLS_ROOT/_shared/get_kusto_token.py https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn
```

- 输出 `code: 0` → 登录有效，继续；**顺手留着这个 token 给第 2 步兜底复用**。
- 输出 `code: 1` → **立即终止，不做任何查询**；直接告诉用户：**Azure CLI 登录已失效，请重新 `az login`**，登录完再让我重试。
- 只查**一个**集群即可：az 登录缓存是全局的，一个能过 → 全部能过。

**1. 建查询**：阅读后续的说明，得到查询的集群，数据库和表 。

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


# Azure Resource Graph — 资源变更历史查询

## 一、表的作用（一句话）

`AzureResourceGraph.Resources` 是 **Azure 中国区资源管理器（ARM）的资源变更事件流**：每次资源被创建/更新/删除（或全量同步刷新）时，都会向该集群投递一条**该资源当时的完整 ARM JSON 快照**（`properties` 为 dynamic 类型，包含资源全部配置）。

因此它同时具备两个用途：

1. **变更历史（change log）**：按 `id` 过滤 + 按 `timestamp` 排序，即可看到某个资源"在什么时间变成了什么样"，两条记录之间 `properties` 的差异就是客户/平台做了什么改动。
2. **当前状态查询（resource lookup）**：取某资源 `timestamp` 最新的一条，即其最近一次已知配置。可替代/补充 Azure Resource Graph（`az resourcegraph query`，中国区可用性受限）。

典型排障场景：

- AppGW 更新失败后，还原失败时刻网关的完整配置（listener/rule/pool/证书），与操作日志（`operationcheck` skill）互相印证。
- 确认某 VIP/子网/NIC 配置在某时间点是否被改过（比如"客户说没人动过 LB"，但 Resources 里 timestamp 显示 03:14 有人改过）。
- 资源枚举：某 subscription 下有多少 AppGW、它们的 SKU/region（用 `type` 过滤 + `summarize`）。
- 排查"资源消失了"：`deleted == true` 的行就是删除事件。

## 二、两个集群的区别（重要，先读）

| 集群 | 库 | 数据特点（2026-10 实测） |
|---|---|---|
| `argmcn2nrpone.chinanorth2` | AzureResourceGraph | 表：`Resources` + `ProxyResources`。近 7 天来源分布：`Notification`（变更事件）、`ArnNotification`、`FullSync`（周期全量同步，约每天 1 次）、`FullSyncNotification`。**Notification 行带有完整 `properties` 大 JSON**（实测 AppGW 单行 50KB+，含全部子资源）。 |
| `argmcn2arm1pone.chinanorth2` | AzureResourceGraph | 表：`Resources` + `ContainerResources`。近 7 天量更大（2d 约 1.3 亿行）。`Notification`/`ArnNotification` 行是**轻量事件**（`sku` 等为 null，`properties` 极小），**只有 `FullSync` 行（约每天 03:00 一次全量快照）携带完整 properties**。 |

**实践结论：**

- 需要**完整配置快照**时：优先查 `nrpone`（变更事件即带全文）；在 `arm1pone` 上则必须取 `FullSync` 行（或把时间窗口放宽到覆盖最近一次 FullSync）。
- 需要**精确的变更时间点**时：用 `Notification`/`ArnNotification` 行的 `timestamp`（arm1pone 上这些行轻量但时间戳精确）。
- 两个集群存的是**同一批资源**（实测同一 AppGW 在两个集群的 `rowId` 完全一致），不是地域拆分，而是不同管道的副本。查不到数据时换另一个集群重试。

## 三、表结构（两集群一致）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | string | **资源 ID（全路径，小写）**。过滤资源的核心字段，匹配用 `=~` |
| `name` | string | 资源名 |
| `type` | string | 资源类型，如 `microsoft.network/applicationgateways` |
| `tenantId` / `subscriptionId` / `resourceGroup` | string | 层级定位 |
| `location` / `kind` / `zones` | string/dynamic | 地域、kind（如 AppGW 的 kind）、可用区 |
| `properties` | dynamic | **资源完整配置 JSON**（ARM GET 原样）。AppGW 含 backendAddressPools、frontendIPConfigurations、httpListeners、requestRoutingRules、sslCertificates（含证书公钥 base64）等 |
| `sku` / `plan` / `tags` / `identity` / `aliases` | dynamic | SKU（如 Standard_v2/capacity）、标签等 |
| `timestamp` | datetime | **事件/快照时间（UTC）**。同一资源多次出现 = 多次变更 |
| `deleted` | bool | true = 该资源被删除（删除事件） |
| `partial` | bool | true = 部分快照（少见，约占 0.02%） |
| `source` | string | 数据来源：`Notification`（变更事件）/`ArnNotification`/`FullSync`（每日全量）/`FullSyncNotification` |
| `apiVersion` / `routingType` / `scopeType` / `scopeId` | string/int | ARM 元数据 |
| `rowId` / `storeUniqueId` / `rowSize` | string/long | 管道内部标识 |
| `systemData` | dynamic | created/lastModified 元数据（部分行有） |

⚠️ **坑：`properties` 是 dynamic 大 JSON，MCP 返回整行可能爆上下文（AppGW 实测 50KB+）。** 查询时必须用 `project`/`extend` 只取需要的字段（见下），不要 `take N` 后直接返回全行。

## 四、核心查询模板

### 1. 某资源的变更历史（时间线）

```kql
Resources
| where timestamp >= ago(3d)
| where id =~ '<资源ID小写>'
| order by timestamp desc
| project timestamp, source, deleted, properties.provisioningState, properties.operationalState
```

输出即"该资源每天/每次被触碰的时间和状态"。FullSync 每天会刷一次，所以**即使没人改，也会看到每天约 1 条 FullSync 记录**；真正的变更事件是 `Notification`/`ArnNotification` 来源。

### 2. 某资源的最新完整配置

```kql
Resources
| where id =~ '<资源ID小写>'
| where timestamp >= ago(1d)
| order by timestamp desc
| take 1
| project properties
```

### 3. 对比两个时间点的配置差异（定位"谁改了什么"）

⚠️ **先区分"真配置变更"与"资源状态切换"**：很多"更新"记录其实是**开启/关闭/启停**类操作（AppGW 的 `operationalState` 在 Running/Stopped 之间切换、LB/资源启停、WAF 模式开启关闭等）。这类操作会写一条 ARM 更新记录、产生 `Notification` 事件，甚至短暂出现 `provisioningState=Updating`，但**配置本身没有变化**（properties 主体 MD5 指纹一致）。下结论前必须先做下面的指纹比对，确认是"配置变了"还是"只是开关切换"，再决定排查方向：

**第一步：快速判断是否真有变化（用 properties 的 MD5 指纹）：**

```kql
Resources
| where id =~ '<id>'
| where timestamp >= datetime(<start>)
| order by timestamp desc
| project timestamp, source, hash_md5(tostring(properties))
```

相邻行哈希相同 = 配置没变；不同 = 配置改了，再走第二步。

**判定规则：**
- 哈希相同 + `properties.operationalState` 在 Running/Stopped 间切换（或 `provisioningState` 短暂 Updating 后回落）→ **只是开启/关闭，不是配置变更**。回答时说明"该时段的操作是启停资源，配置无变化"，不要误判为"有人改配置"。
- 哈希相同 + 只有 `etag` 变化 → 同步噪音，忽略。
- 哈希不同 → 真配置变更，走第二步做字段级对比；若同时 operationalState 也变了，说明启停与配置修改可能是两次独立操作，分别说明。

**第二步：分别取出前后两行的完整 properties 做字段级对比：**

```kql
let before = Resources
    | where id =~ '<id>' and timestamp < datetime(<T>)
    | order by timestamp desc
    | take 1
    | project properties;
let after = Resources
    | where id =~ '<id>' and timestamp >= datetime(<T>)
    | order by timestamp asc
    | take 1
    | project properties;
// 在结果里人工对比 before/after 的 properties
```

⚠️ 对比时忽略 `etag`（每次同步都会变，不代表配置变化）。AppGW 重点看：httpListeners、requestRoutingRules、backendAddressPools、backendHttpSettingsCollection、urlPathMaps、sslCertificates 的数量和内容。

### 4. 资源枚举/统计（某 subscription 下的 AppGW 清单）

```kql
Resources
| where timestamp >= ago(1d)
| where type =~ "microsoft.network/applicationgateways"
| where deleted == false
| where subscriptionId == '<subId>'
| summarize dcount(id)
```

### 5. 删除事件排查

```kql
Resources
| where timestamp >= ago(7d)
| where id =~ '<id>' and deleted == true
```

## 五、AppGW 专用字段速查（properties 内）

- `properties.provisioningState` — 部署状态（Succeeded/Failed/Updating）
- `properties.operationalState` — Running/Stopped
- `properties.resourceGuid` — 网关 GUID（可关联 SLB/数据面日志）
- `properties.sku.name` / `properties.sku.capacity` — Standard_v2、实例数
- `properties.frontendIPConfigurations[*].properties.publicIPAddress.id` — 判 ELB；无此字段 + 有 `privateIPAddress` → ILB
- `properties.httpListeners[*]` — 监听器（hostNames/protocol/frontendPort/sslCertificate）
- `properties.requestRoutingRules[*].properties` — priority/ruleType/路由目标
- `properties.backendAddressPools[*].properties` — backendAddresses/backendIPConfigurations
- `properties.sslCertificates[*].properties.publicCertData` — 证书（base64）
- `properties.gatewayIPConfigurations[*].properties.subnet.id` — 网关子网

## 六、通用注意事项

1. **必须带时间过滤**（`timestamp >= ago(Nd)`），表有全量历史且量大（单集群 2d 可达 1.3 亿行），不带时间过滤会超时/爆量。
2. `id` 匹配一律 `=~`（ARM id 在表里是小写；用户给的可能是大写）。`contains` 易误命中。
3. `timestamp` 是 UTC；展示给用户时转成其本地时区。
4. FullSync 约每天 03:00 UTC 跑一次全量，"每天一条"不是变更，别当成客户操作。
5. 返回整行前务必 `project` 裁剪；`properties` 子字段用 `properties.xxx` 点路径访问。
6. 查不到数据时：a) 换另一个集群；b) 放宽时间窗口；c) 确认 resource ID 是否正确（可用 `where name contains '<name>'` 反查）。
7. 与 `operationcheck`（ARM 操作审计）配合：Resources 给"改成了什么"，operationcheck 给"谁发起的、成功还是失败"。
