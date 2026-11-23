---
name: "vpngateway-lookup"
description: "通过 Kusto MCP 查询 Azure Data Explorer（aznwchinamc/aznwmds），从 Azure VPN 网关的资源 ID（Resource ID）或 Subscription ID 快速解析出 TenantID/DeploymentID、GatewayID、Gateway VIP 地址等关键标识，用于后续 VPN 网关排障。"
---

# Azure VPN Gateway 资源标识快速查询技能

## 用途

给定一个 VPN 网关的 **资源 ID** 或 **Subscription ID**，在KQL 查询内拿到后续所有排障所需的关键标识：

| 需要的值 | 说明 | 来源列 |
|---|---|---|
| **GatewayID** | 网关内部 ID（UUID） | `SubIdToGatewayIdMappingTable.GatewayId` |
| **TenantID / DeploymentID** | 形如 `armrg-<GatewayID>` | `GatewayConfigurationLogsTable.DeploymentId`（= `Tenant`） |
| **Gateway VIP** | 网关公网 IP | `GatewayConfigurationLogsTable.GatewayVip` |
| **VNet 名称** | 网关所在 VNet | `GatewayConfigurationLogsTable.VirtualNetworkName` |
| **Gateway 模式** | `BrooklynLite` / `ActiveActive` 等 | `GatewayConfigurationLogsTable.GatewayMode` |
| **Fabric moniker** | 底层 fabric 集群标识（如 `wavnetcnn3_1`），**不是** DeploymentID | `SubIdToGatewayIdMappingTable.Tenant` |

> ⚠️ 易混淆点：`SubIdToGatewayIdMappingTable` 里的 `Tenant` 列是 **fabric moniker**（例如 `wavnetcnn3_1`），
> 而 `GatewayConfigurationLogsTable` 里的 `Tenant`/`DeploymentId` 才是 `armrg-<gatewayId>` 格式的 DeploymentID。
> 两者都叫 "Tenant"，含义完全不同，不要混用。

## 集群连接

- **cluster**: `https://aznwchinamc.chinanorth2.kusto.chinacloudapi.cn`
- **database**: `aznwmds`

## 执行前预检

预检 token（每次任务首次查询前，只查一个集群预检token）**

```powershell
python $WANWU_SKILLS_ROOT/_shared/get_kusto_token.py https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn
```

- 输出 `code: 0` → 登录有效，继续；**顺手留着这个 token 给第 2 步兜底复用**。
- 输出 `code: 1` → **立即终止，不做任何查询**；直接告诉用户：**Azure CLI 登录已失效，请重新 `az login`**，登录完再让我重试。
- 只查**一个**集群即可：az 登录缓存是全局的，一个能过 → 全部能过。

然后执行 `kusto-mcp__initialize-connection(cluster_url, database)`连接集群（每次切换集群/库都要重新 initialize）。

## 从资源 ID 到标识的解析步骤

用户给的资源 ID 形如：
```
/subscriptions/<SUB_ID>/resourceGroups/<RG>/providers/Microsoft.Network/virtualNetworkGateways/<GW_NAME>
```

### 第 0 步：从资源 ID 提取 Subscription ID

直接解析路径段 `subscriptions/` 后面那一段即为 `<SUB_ID>`。
（这些表里**没有**能直接按完整资源 ID 查询的列，所以 Subscription ID 是入口。）

### 第 1 步：Subscription → GatewayID（+ 区分网关类型）

```kusto
SubIdToGatewayIdMappingTable
| where SubId == '<SUB_ID>'
| where PreciseTimeStamp > ago(7d)
| distinct GatewayId, Tenant, GatewayType, GatewayMode
```

**结果解读：**
- `GatewayType == 'VirtualNetworkGateway'` 的行 → 这才是 VPN 网关本身，`GatewayId` 即 **GatewayID**。
- `GatewayType == 'LocalNetworkGateway'` 的行 → 对端站点网关，排除。
- `Tenant` 列 → fabric moniker（如 `wavnetcnn3_1`），**不是** DeploymentID。
- 若同一订阅下有多个 VirtualNetworkGateway，结合资源 ID 中的网关名 / VNet 名在第 2 步确认。

### 第 2 步：Subscription → DeploymentID + VIP + VNet 名

```kusto
GatewayConfigurationLogsTable
| where CustomerSubscriptionId == '<SUB_ID>'
| where PreciseTimeStamp > ago(10d)
| take 5
| project PreciseTimeStamp, Tenant, DeploymentId, VirtualNetworkName, GatewayVip, GatewayMode, TenantGatewayId
```

**结果解读：**
- `DeploymentId`（= `Tenant`）→ **TenantID/DeploymentID**，格式 `armrg-<GatewayID>`，末尾 UUID 应等于第 1 步的 GatewayID（不强制交叉验证，有的旧模式网关验证不通过）。
- `GatewayVip` → **VIP 地址**。
- `VirtualNetworkName` → VNet 名（与资源 ID 所在 VNet 对齐，确认是同一个网关）。
- 该表每分钟刷新，`take 5` 取最近几条即可；列名 `CustomerSubscriptionId` 注意是**小写 d**。

### 交叉验证（可选）

第 2 步 `DeploymentId` 去掉 `armrg-` 前缀后的 UUID 应等于第 1 步 `GatewayId`。
如果不一致（同订阅多个网关），用 `VirtualNetworkName` / 网关名定位正确的那一个。

## 完整示例

资源 ID：
```
/subscriptions/a34ac9df-08b3-4d22-841b-494f0171663e/resourceGroups/REG-ASI-VPN-01-PROD/providers/Microsoft.Network/virtualNetworkGateways/VPN-ASI-AzureVPNGW-01-PROD
```

第 1 步（`SubId == 'a34ac9df-08b3-4d22-841b-494f0171663e'`）得到：

| GatewayId | Tenant (moniker) | GatewayType | GatewayMode |
|---|---|---|---|
| `cf0a0049-3587-4857-bf1d-b2ae6b778267` | `wavnetcnn3_1` | VirtualNetworkGateway | BrooklynLite |
| `7ee20049-2c19-439c-8f8e-96e8e1435cf4` | `wavnetcnn3_1` | LocalNetworkGateway | None |
| `8c130049-a8ee-4ba3-a3e0-2ad96b56486c` | `wavnetcnn3_1` | LocalNetworkGateway | None |
| `d5930049-a81f-4d68-8073-26eb15bf19f6` | `wavnetcnn3_1` | LocalNetworkGateway | None |

→ 排除 3 个 LocalNetworkGateway，VPN 网关 = `cf0a0049-3587-4857-bf1d-b2ae6b778267`。

第 2 步得到：

| DeploymentID | Gateway VIP | VNet | Mode |
|---|---|---|---|
| `armrg-cf0a0049-3587-4857-bf1d-b2ae6b778267` | `143.64.9.4` | `VN-CHN-JDE-VPN` | `BrooklynLite` |

✅ 交叉验证：`armrg-` 后的 UUID == `cf0a0049-3587-4857-bf1d-b2ae6b778267`，一致。(不强制交叉验证，有的旧模式网关验证不通过)

## 输出给后续排障的参数

拿到后即可填充 `vpngateway` 技能里的标准变量：

```
_subscriptionId = a34ac9df-08b3-4d22-841b-494f0171663e
_tenantId       = armrg-cf0a0049-3587-4857-bf1d-b2ae6b778267     (DeploymentID)
_gatewayId      = cf0a0049-3587-4857-bf1d-b2ae6b778267
_gatewayVip     = 143.64.9.4
```

## 涉及的表速查

| 表名 | 关键列 | 用途 |
|---|---|---|
| `SubIdToGatewayIdMappingTable` | `SubId`, `GatewayId`, `Tenant`(moniker), `GatewayType`, `GatewayMode` | Subscription → GatewayID，区分 VNG/LNG |
| `GatewayConfigurationLogsTable` | `CustomerSubscriptionId`, `Tenant`, `DeploymentId`, `GatewayVip`, `VirtualNetworkName`, `GatewayMode`, `TenantGatewayId` | Subscription → DeploymentID + VIP + VNet（每分钟刷新） |
| `VpnGatewayTable` | `CustomerSubscriptionId`, `VpnGatewayArmId`(完整资源ID), `Tenant`, `Name`, `NrpUri` | 有完整资源 ID 列，但更新不频繁（创建/变更时才有），7 天窗口常为空 |
| `NrpResourceUriMappingTable` | `CustomerSubscriptionId`, `Id`(资源ID), `NrpResourceUri`, `ResourceType` | 资源 URI 映射，按需查 |

## 注意

- 时间窗口：第 1 步默认 `ago(7d)`，第 2 步默认 `ago(90d)`；查不到时扩大窗口（如 `ago(180d)`）。
- 同订阅多网关：用 `GatewayType == 'VirtualNetworkGateway'` 过滤 + VNet 名 / 网关名交叉确认。
- `VpnGatewayTable` 虽有 `VpnGatewayArmId`（完整资源 ID）可直接匹配，但写入不频繁，**不作为首选路径**，仅在第 1/2 步都失败时兜底。
- 复核原则：给出结论时附上实际使用的 KQL 与关键数据行作为依据，不编造数据。
