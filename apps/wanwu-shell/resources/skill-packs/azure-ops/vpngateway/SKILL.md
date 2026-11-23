---
name: "vpngateway"
description: "你是一位日志分析专家，查询 Azure Data Explorer 集群中存储的的日志记录，本文档提供了 Azure 中国区 VPN 网关监控和故障排除的 KQL查询技能,你需要查询相关的日志，分析VPN网关的连接情况、分析连接失败的原因，分析metric等等。"
---

# Azure VPN Gateway Kusto 查询技能文档


## 常用参数

| 变量 | 说明 | 示例 |
|---|---|---|
| `_tenantId` | VPN 网关 Tenant ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `_subscriptionId` | 客户订阅 ID | `dad9af98-619d-414b-b917-52a14c0f8756` |
| `_gatewayId` | VPN 网关 ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `_gatewayVip` | 网关 VIP 地址 | `159.27.27.247`|
| `_localNetworkGatewayIp` | Local Network Gateway 填写的对端 IP | `203.0.113.10` |
| `_startTime` | 查询起始时间（UTC） | `datetime(2025-12-03 16:30)` |
| `_endTime` | 查询结束时间（UTC） | `datetime(2025-12-04 04:30)` |

### Kusto 集群连接信息

- **cluster**: `https://aznwchinamc.chinanorth2.kusto.chinacloudapi.cn`
- **database**: `aznwmds`

## 执行流程（token 预检 → MCP 优先 → 脚本兜底）

**0. 预检 token（每次任务首次查询前，只查一个集群）**

```powershell
python $WANWU_SKILLS_ROOT/_shared/get_kusto_token.py https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn
```

- 输出 `code: 0` → 登录有效，继续；**顺手留着这个 token 给第 2 步兜底复用**。
- 输出 `code: 1` → **立即终止，不做任何查询**；直接告诉用户：**Azure CLI 登录已失效，请重新 `az login`**，登录完再让我重试。
- 只查**一个**集群即可：az 登录缓存是全局的，一个能过 → 全部能过。

**1. 建查询**：从 ## 查询方法 选取查询的集群，数据库和表 。

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

# 查询方法

## 首先调用vpngateway-lookup skill 获取Gateway的GatewayID 或者 deploymentID/TenantID等信息用于后续的日志筛选

## 1. S2S/P2S 连接数量查询

### 1.1 S2S 及 P2S 连接数量 [Tenant/TenantID]

查询 VPN 网关的 Site-to-Site（S2S）和 Point-to-Site（P2S）连接数量。

```kusto
cluster('aznwchinamc.chinanorth2').database('aznwmds').GatewayHealthFiveMinuteTable
| where Tenant == _tenantId
| where TimeStamp >= _startTime and TimeStamp <= _endTime
```

## 2. VPN 网关流量查询

### 2.1 VPN 网关总体流量 [TenantID]

查询 VPN 网关的整体带宽使用情况。

```kusto
cluster('aznwchinamc.chinanorth2').database('aznwmds').GatewayTenantBandwidthUsageTable
| where TimeStamp >= _startTime and TimeStamp <= _endTime
| where Tenant == _tenantId
```

### 2.2 VPN 网关 Internet 流量 [TenantID]

查询指定 RoleInstance 的 Internet 流量，适用于排查公网侧带宽问题。

```kusto
cluster('aznwchinamc.chinanorth2').database('aznwmds').GatewayTenantBandwidthUsageTable
| where Tenant == _tenantId
| where TrafficType == 'Internet'
| where RoleInstance == 'GatewayTenantWorker_IN_0'
| where TimeStamp >= _startTime and TimeStamp <= _endTime
```

## 3. VPN 网关配置信息查询

### 3.1 网关配置概览 [SubscriptionID]

查询 VPN 网关的配置信息，包括虚拟网络名称、网关 VIP、网关模式等。

```kusto
cluster('aznwchinamc.chinanorth2').database('aznwmds').GatewayConfigurationLogsTable
| where TimeStamp >= _startTime and TimeStamp <= _endTime
| where CustomerSubscriptionID == _subscriptionId
| project TimeStamp, Tenant, RoleInstance, DeploymentId, CustomerSubscriptionId, VirtualNetworkName, GatewayVip, GatewayMode
```

## 4. VPN 网关健康状态查询

### 4.1 网关健康报告 [SubscriptionID + GatewayVIP]

查询 VPN 网关的健康状态报告。

```kusto
cluster('aznwchinamc.chinanorth2').database('aznwmds').GateayHealthReportLogsTable
| where TimeStamp >= _startTime and TimeStamp <= _endTime
| where CustomerSubscriptionId == _subscriptionId and GatewayVip == _gatewayVip
```

## 5. VPN 网关 Tenant Log 查询

### 5.1 网关 Tenant 日志 [GatewayID]

查询 VPN 网关的 Tenant 级别运行日志。

```kusto
cluster('aznwchinamc.chinanorth2').database('aznwmds').GatewayTenantLogsTable
| where GatewayId == _gatewayId
| where PreciseTimeStamp >= _startTime and PreciseTimeStamp <= _endTime
| project TIMESTAMP, RoleInstance, Message, GatewayBuildVersion
```

## 6. 预期维护 / 隧道事件查询

### 6.1 隧道事件与计划维护 [GatewayID]

查询 VPN 网关的隧道事件，用于判断是否为预期维护（Planned Failover）。

> **时间窗口提示**：排查维护事件时，建议将 `_startTime` 提前 1 小时（例如 incident 起始为 16:30 时，可将 `_startTime` 设为 `datetime(2025-12-03 15:30)`），以覆盖维护开始前的事件。

```kusto
cluster('aznwchinamc.chinanorth2').database('aznwmds').TunnelEventsTable
| where GatewayId contains _gatewayId
| where PreciseTimeStamp >= _startTime and PreciseTimeStamp <= _endTime
| project TIMESTAMP, RoleInstance, Message, DownTimeInMilliSeconds, IsPlannedFailover, TunnelName, TunnelStateChangeReason
```

## 7. IKE Log 查询

### 7.1 IKE 协商日志 [GatewayID + GatewayVIP + LocalNetworkGatewayIP]

查询 VPN 网关的 IKE 协商日志，用于排查 S2S 隧道连接问题。

```kusto
cluster('aznwchinamc.chinanorth2').database('aznwmds').IkeLogsTable
| where GatewayId contains _gatewayId
| where PreciseTimeStamp >= _startTime and PreciseTimeStamp <= _endTime
| where EventMessage contains _gatewayVip
| where EventMessage contains _localNetworkGatewayIp
| project GatewayBuildVersion, TIMESTAMP, RoleInstance, EventMessage
```

## 8. 故障排查建议查询顺序

收到 VPN 网关问题时，建议按以下顺序依次查询，由配置到细节逐步缩小范围：

1. **配置信息**（章节 3）— 确认网关 VIP、模式、虚拟网络等基础信息
2. **健康状态**（章节 4）— 检查网关当前健康报告
3. **S2S/P2S 连接数量**（章节 1）— 确认连接数是否正常
4. **流量**（章节 2）— 检查带宽使用，必要时查看 Internet 流量细分
5. **Tenant Log**（章节 5）— 查看网关运行日志
6. **维护/隧道事件**（章节 6）— 排除预期维护影响（起始时间可提前 1 小时）
7. **IKE Log**（章节 7）— 深入排查 S2S IKE 协商问题
