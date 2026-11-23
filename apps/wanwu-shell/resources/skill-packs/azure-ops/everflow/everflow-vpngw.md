---
name: everflow-vpngw
description: VPN Gateway（VPNGW，S2S/P2S）场景下，准备 Everflow 抓包配置。输入 subscriptionId + VPNGW 名称（或 VPNGW resource ID）+ 对端 on-prem 公网 IP，自动查询该 VPNGW 的 VIPAddress、所有 VPNGW 实例节点的 NodeIp/TOR（兼容 Cloud Service 与 VMSS 两种部署），并以 VIP 反查所有 SLB Mux 实例的 PA/TOR，最终输出：VPNGW 实例侧 TOR 列表 + 3 份 filter（Mux PA 分别按 /32、/24、/16 聚合的入向规则 + 1 条 VPNGW VIP→on-prem 出向反向规则）。触发词：everflow VPNGW、VPNGW 抓包、VPN Gateway 抓包、S2S VPN 抓包、VPN 网关入流量抓包、VPN 网关 VIP 抓包
tables:
  - cluster('aznwchinamc.chinanorth2').database('aznwmds').GatewayTenantHealth
  - cluster('aznwchinamc.chinanorth2').database('aznwmds').NrpResourceUriMappingTable
  - cluster('azcrpmc').database('crp_allmc').VMApiQosEvent
  - cluster('azslbmc').database('azslbmdsmc').VipRangesSnapshotEvent
  - cluster('azurecm.chinanorth2').database('azurecm').LogContainerSnapshot
  - cluster('aznwchinamc.chinanorth2').database('aznwmds').Servers
  - cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceInterfaceLinks
  - cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceStatic
  - cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface
parameters:
  - name: subscriptionId
    required: true
    description: VPNGW 所在订阅 ID。若用户给的是 VPNGW resource ID，则从中解析（/subscriptions/{subId}/...）
  - name: vpngwName
    required: true
    description: VPNGW 名称（如 VNG-HEC60-HUI-01）。若给的是 resource ID，则取末段 virtualNetworkGateways/{name}
  - name: onpremPublicIp
    required: true
    description: 对端 on-prem VPN 设备的公网 IP（如 113.108.104.170 或 113.108.104.170/32），用作出向反向规则的目标地址
  - name: startTime
    required: false
    description: 查询开始时间（UTC，ISO 8601）。默认 endTime - 2d
  - name: endTime
    required: false
    description: 查询结束时间（UTC，ISO 8601）。默认 now()
---

# VPNGW 场景 Everflow 抓包准备

排查 VPN Gateway 入/出流量问题（如 S2S 隧道不通、IPsec 协商失败、对端经 on-prem 访问 VNet 资源异常、VPNGW 实例丢包）时，需要在 **所有 VPNGW 实例所在 TOR** 上抓包，定位 Mux → VPNGW 实例宿主机这一段封装流量，以及 VPNGW 实例 → on-prem 的回程流量。

## 一、数据平面（为什么这样抓）

VPNGW 的前端 VIP 实际上是一个 **SLB VIP**，由该 Region 的若干 **SLB Mux** 实例（active-active）承载。一次 S2S 会话的两段路径：

```
On-prem VPN 设备(公网 IP) ──IPsec──▶ VPNGW VIP（= SLB VIP）──▶ SLB Mux(PA) ──VxLAN/GRE 封装──▶ VPNGW 实例宿主机(NodeIp) ──▶ VPNGW 实例
                                          ▲                                                              │
                                          └──────────── 返程：VPNGW VIP → on-prem 公网 IP ◀─────────────┘
```

- 抓包点：**VPNGW 实例宿主机的 TOR（T0）**
- **入向**：在该 TOR 上，入向报文的外层 5-tuple 为 `SrcIp = Mux PA`，`DstIp = VPNGW NodeIp`。一个 VIP 由 N 个 Mux 服务，一个 VPNGW 由 M 个实例承载，事先无法预测命中哪一对 → **入向规则取 Mux PA × VPNGW NodeIp 的笛卡尔积**。
- **出向（反向）**：VPNGW 实例的回程流量经 VFP/SLB 层做 SNAT 后，源 IP 已重写为 **VPNGW VIP**，目标为 **on-prem 公网 IP**。在 TOR 看到的是解封装后的 5-tuple，所以一条 `VPNGW VIP/32 → on-prem/32` 反向规则即可。

> 🆚 **与 everflow-ergw 的关键区别**：ERGW 只有入向、不生成反向规则；VPNGW 是双向 S2S 隧道，**每份 filter 末尾要附 1 条 `VPNGW VIP → on-prem 公网 IP` 的出向反向规则**（类似 everflow-slb 的反向规则，但目标地址是 on-prem 公网 IP，而非客户端 SrcVIP）。

本 skill 自动到 `aznwmds` + `azurecm` + `azcrpmc` + `azslbmc` 跨集群关联查询，输出 **一组** 抓包准备文件（文件前缀 `everflow-vpngw-`）：

- **TOR 列表**：所有 VPNGW 实例所在 TOR
- **3 份 Everflow filter JSON**：Mux PA 分别按 `/32`、`/24`、`/16` 聚合，每份末尾附 1 条出向反向规则，按抓包系统规则数上限灵活选择

---

## 二、输入解析

| 输入 | 含义 | 解析规则 |
|------|------|---------|
| **subscriptionId** | VPNGW 所在订阅 | 直接用；或从 resource ID 的 `/subscriptions/{subId}/` 段提取 |
| **vpngwName** | VPNGW 名称 | 直接用；或从 resource ID 末段 `virtualNetworkGateways/{name}` 提取 |
| **onpremPublicIp** | 对端 on-prem VPN 设备公网 IP | 用作出向反向规则的 `DstIpPrefix`；若用户未带 `/32` 则补 `/32` |

> VPNGW resource ID 形如：
> `/subscriptions/7ab07b40-8512-43d8-8013-2e63c625027a/resourceGroups/HEC60-HUI-chinanorth3-1/providers/Microsoft.Network/virtualNetworkGateways/VNG-HEC60-HUI-01`
> → subId = `7ab07b40-...`，vpngwName = `VNG-HEC60-HUI-01`

---

## 三、执行流程

```
Step 0: Query #0 - GatewayTenantHealth
        以 subId + vpngwName 查（含 GatewayType != "Dedicated" 过滤）
        → VIPAddress、GatewayId、GatewayType、Region、GatewayDeploymentType、DeploymentId
        · GatewayDeploymentType = CloudServiceExtendedSupport → 走 Query #1（Cloud Service 路径）
        · GatewayDeploymentType = VMScaleSet / VMSS 类     → 走 Query #2（VMSS 路径）
        · 不确定时两条都跑，哪条有结果用哪条
Step 1/2: 拿 VPNGW 实例节点的 TOR + NodeIp(AddressesV4)
        · Query #1（Cloud Service VPNGW，用 DeploymentId）
        · Query #2（VMSS VPNGW，用 GatewayId）
Step 3: Query #3 - 以 VIPAddress 反查所有 SLB Mux 实例的 PA(AddressesV4) + TOR
Step 4: 聚合 Mux PA
        - /32 集合：Q#3 全部 AddressesV4，保留原样
        - /24 集合：每个 PA 前 3 段 + ".0/24"，去重
        - /16 集合：每个 PA 前 2 段 + ".0.0/16"，去重
Step 5: 组装输出（everflow-vpngw-*）
        - TOR 列表 = unique(VPNGW 实例 TOR)，逗号分隔
        - 3 份 filter（mux32/mux24/mux16）：
            · 入向（正向）：SrcIpPrefix = Mux PA（按 /32 或 /24 或 /16），DstIpPrefix = VPNGW NodeIp/32
            · 出向（反向，每份末尾 1 条）：SrcIpPrefix = VPNGW VIP/32，DstIpPrefix = on-prem 公网 IP/32
```

> Query #1、#2、#3 互不依赖，可并行；Query #0 必须先跑（提供 VIPAddress 给 Query #3、GatewayId 给 Query #2、DeploymentId 给 Query #1、判断部署类型）。

---

## 四、核心查询模板

> 公共变量：
> ```kql
> let VPNGWNAME = '{vpngwName}';
> let subid = '{subscriptionId}';
> let _startTime = datetime({startTime});
> let _endTime   = datetime({endTime});
> ```

### Query #0 — VPNGW 的 VIPAddress 与部署类型

```kql
let VPNGWNAME = '{vpngwName}';
let subid = '{subscriptionId}';
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
cluster('aznwchinamc.chinanorth2').database('aznwmds').GatewayTenantHealth
| where PreciseTimeStamp >= _startTime - 1d and PreciseTimeStamp <= _endTime
| where CustomerSubscriptionId == subid
| where GatewayType != "Dedicated"
| where GatewayName == VPNGWNAME
| distinct GatewayName, GatewayId, GatewayVmSize, VIPAddress, ProvisioningState,
           VNetName, VNetId, GatewayType, Region, GatewayDeploymentType,
           AzureDeploymentVmSize, PhysicalZones, DeploymentId
```

**字段提取**：

| 输出列 | 用途 |
|--------|------|
| `VIPAddress` | 喂给 Query #3 反查 Mux PA；它是一个 SLB VIP |
| `GatewayId` | 喂给 Query #2（VMSS 路径）定位实例 |
| `DeploymentId` | 喂给 Query #1（Cloud Service 路径）定位实例 |
| `GatewayType` | VPNGW 通常为 `DynamicRouting`（路由型）或 `StaticRouting`；**绝不是 `Dedicated`**（Dedicated 是 ERGW） |
| `GatewayDeploymentType` | 判断走 Query #1（`CloudServiceExtendedSupport`）还是 Query #2（`VMScaleSet`/VMSS） |
| `Region` | 定位集群 |

### Query #1 — VPNGW 实例节点 TOR + NodeIp（Cloud Service 路径）

```kql
let VPNGWNAME = '{vpngwName}';
let subid = '{subscriptionId}';
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
let NodeIds =
    cluster('aznwchinamc.chinanorth2').database('aznwmds').GatewayTenantHealth
    | where PreciseTimeStamp >= _startTime - 1d and PreciseTimeStamp <= _endTime
    | where CustomerSubscriptionId == subid
    | where GatewayType != "Dedicated"
    | where GatewayName == VPNGWNAME
    | distinct DeploymentId
    | join kind=leftouter (
        cluster('azurecm.chinanorth2').database('azurecm').LogContainerSnapshot
        | where TIMESTAMP >= _startTime and TIMESTAMP <= _endTime
        | where Tenant !contains 'TMBOX'
    ) on $left.DeploymentId == $right.tenantName
    | where containerId != ''
    | summarize STARTTIME=min(TIMESTAMP), ENDTIME=max(TIMESTAMP) by nodeId
    | project nodeId;
cluster('aznwchinamc.chinanorth2').database('aznwmds').Servers
| where NodeId in~ (NodeIds)                                  // ⚠️ 必须 in~（大小写不敏感），见“五、关键坑”
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceInterfaceLinks | project StartDevice, StartPort, EndDevice, EndPort) on $left.DeviceName == $right.StartDevice
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceStatic | project Cluster, Regions, DeviceName) on $left.DeviceName == $right.DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface | where isnotempty(AddressesV4) | where InterfaceName =~ 'HostIP') on DeviceName
| extend nodeId = tolower(NodeId)
| project Regions, Cluster, nodeId, ServerName=StartDevice, TOR=EndDevice, TORPort=EndPort, AddressesV4
```

### Query #2 — VPNGW 实例节点 TOR + NodeIp（VMSS 路径，推荐用 Query #0 的 GatewayId）

```kql
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
let GatewayIds = dynamic(['{GatewayId}']);     // 来自 Query #0，直接用 GatewayId 最稳（避免名字含连字符时 has 匹配失败）
let NodeIds =
    cluster('azcrpmc').database('crp_allmc').VMApiQosEvent
    | where resourceGroupName has_any (GatewayIds)
    | where fabricTenantName != ''
    | distinct fabricTenantName, fabricCluster, resourceGroupName
    | join kind=leftouter (
        cluster('azurecm.chinanorth2').database('azurecm').LogContainerSnapshot
        | where TIMESTAMP >= _startTime and TIMESTAMP <= _endTime
        | where Tenant !contains 'TMBOX'
    ) on $left.fabricTenantName == $right.tenantName
    | where containerId != ''
    | project nodeId=toupper(nodeId), containerId, roleInstanceName, tenantName, Tenant, resourceGroupName
    | distinct nodeId;
cluster('aznwchinamc.chinanorth2').database('aznwmds').Servers
| where NodeId in~ (NodeIds)
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceInterfaceLinks | project StartDevice, StartPort, EndDevice, EndPort) on $left.DeviceName == $right.StartDevice
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceStatic | project Cluster, Regions, DeviceName, HardwareSku) on $left.DeviceName == $right.DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface | where isnotempty(AddressesV4) | where InterfaceName =~ 'HostIP') on DeviceName
| extend nodeId = tolower(NodeId)
| project Regions, Cluster, nodeId, ServerName=StartDevice, TOR=EndDevice, TORPort=EndPort, HardwareSku, AddressesV4
```

> 💡 拿不到 GatewayId 时，可改用名字从 `NrpResourceUriMappingTable` 反推（`| where NrpResourceUri contains VPNGWNAME | where ResourceType == 'VirtualNetworkGateway'`）。**注意 VPNGW 名字常含连字符，必须用 `contains` 而非 `has`**（`has` 按 term 匹配，连字符会被当分隔符导致匹配失败 → GatewayIds 为空 → 全链返回空）。
>
> 💡 Cloud Service VPNGW 跑 Query #1 出结果、Query #2 为空；VMSS VPNGW 反之。不确定时两条都跑。

**字段提取（Query #1 / #2 共同）**：

| 输出列 | 用途 |
|--------|------|
| `TOR` | VPNGW 实例所在 TOR，加入 TOR 列表（抓包点） |
| `AddressesV4` | VPNGW 实例宿主机 PA（= NodeIp），用作 filter 的入向 `DstIpPrefix` |

### Query #3 — VIP 对应的所有 SLB Mux 实例 PA + TOR

```kql
let SLBVIP = '{VIPAddress}';        // 来自 Query #0
let RingNames =
    cluster('azslbmc').database('azslbmdsmc').VipRangesSnapshotEvent
    | where env_time > ago(4h)
    | where isnotempty(SLBVIP)
    | where env_cloud_location != '<null>'
    | where ipv4_is_in_range(SLBVIP, VipRange) or ipv6_is_in_range(SLBVIP, VipRange)
    | summarize make_list(RingName);
cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
| where TIMESTAMP > ago(4h)
| where tenantName has_any (RingNames)
| summarize arg_max(TIMESTAMP, *) by tenantName, nodeId
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers | extend nodeId = tolower(NodeId)) on $left.nodeId == $right.nodeId
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks | project StartDevice, StartPort, EndDevice, EndPort) on $left.DeviceName == $right.StartDevice
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceStatic | project Cluster, Regions, DeviceName) on $left.DeviceName == $right.DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface | where isnotempty(AddressesV4) | where InterfaceName =~ 'HostIP') on DeviceName
| project Regions, Cluster, tenantName, nodeId, roleInstanceName, TOR=EndDevice, AddressesV4
| sort by Regions, roleInstanceName
```

**字段提取**：

| 输出列 | 用途 |
|--------|------|
| `AddressesV4` | Mux 宿主机 PA → filter 入向 `SrcIpPrefix`（按 /32∥/24∥/16 聚合） |
| `tenantName` | SLB Ring 名称（一个 VIP 常由多 Ring × 多 Mux 实例承载） |
| `TOR` | Mux 端 TOR（本 skill 不抓 Mux 侧，仅供参考） |

---

## 五、关键坑（必读）

1. **`Servers.NodeId` 是大写，`LogContainerSnapshot.nodeId` 是小写** → 用 `where NodeId in (NodeIds)` 会因大小写不一致命中 0 行、整条查询返回空。**必须用 `in~`（大小写不敏感）**，或在子查询里统一大小写。
2. **`GatewayType != "Dedicated"`**：这是 VPNGW 与 ERGW 在 `GatewayTenantHealth` 中的核心区分。ERGW 是 `Dedicated`，VPNGW 是 `DynamicRouting`/`StaticRouting`。漏掉该过滤可能混入同订阅的 ERGW。
3. **VIP 是 SLB VIP**：VPNGW 的 `VIPAddress` 由 SLB Mux 承载，所以入向 `SrcIpPrefix` 来自 Query #3 的 Mux PA，而不是 VPNGW 自身地址。
4. **VPNGW 名字含连字符**：从 `NrpResourceUriMappingTable` 反查时必须用 `contains`，不要用 `has`。优先直接用 Query #0 返回的 `GatewayId`。
5. **部署类型决定路径**：`CloudServiceExtendedSupport` 走 Query #1，`VMScaleSet` 走 Query #2；拿不准就两条都跑。
6. **双向：入向 + 出向反向规则**：与 ERGW 不同，VPNGW 每份 filter 末尾要附 1 条 `VPNGW VIP/32 → on-prem 公网 IP/32` 出向规则。

---

## 六、输出格式（文件前缀 `everflow-vpngw-`）

### 6.1 TOR 列表 — `everflow-vpngw-tors.txt`

```
{TOR_vpngw_1},{TOR_vpngw_2},...,{TOR_vpngw_M}
```

- 取 Query #1 或 #2 的所有 `TOR`，去重后逗号分隔（不带空格）

### 6.2 Everflow Filter（3 份 JSON，按 Mux PA 聚合粒度区分）

每份 JSON 结构相同：**N×M 条入向规则 + 1 条出向反向规则**：

```json
[
  {"SrcIpPrefix":"{MuxPA_aggregated}","DstIpPrefix":"{VpngwNodeIp_x}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  ...
  {"SrcIpPrefix":"{VPNGW_VIP}/32","DstIpPrefix":"{onprem_public_ip}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

三种聚合粒度：

| 文件 | Mux PA 形式 | 聚合方式 | 规则数 | 适用场景 |
|------|------------|----------|-------|---------|
| `everflow-vpngw-filter-mux32.json` | `a.b.c.d/32` | Q#3 原始 PA 逐个保留 | **N × M + 1** | 默认；规则数在抓包系统上限内时首选（最精确） |
| `everflow-vpngw-filter-mux24.json` | `a.b.c.0/24` | 每个 PA 取前 3 段 + `.0/24`，去重 | **N_24 × M + 1** | 规则超限或想适度合并 Mux；可能引入同 /24 噪声 |
| `everflow-vpngw-filter-mux16.json` | `a.b.0.0/16` | 每个 PA 取前 2 段 + `.0.0/16`，去重 | **N_16 × M + 1** | 规则数极度受限；通常 N_16 ≤ 3，最简洁；噪声最大 |

> N = Mux PA 个数（/32），M = VPNGW 实例数；N_24、N_16 是按 /24、/16 去重后的子网数；末尾 +1 为出向反向规则。
>
> 实测一个 Region 内 Mux PA 通常落在 2~3 个 /16 内，所以 `/16` 版本规则数极少，**最适合规则数受限的抓包系统**；用 Wireshark `ip.src` 反向过滤即可剔除误抓。

字段映射：

| Filter 字段 | 来源 | 说明 |
|------------|------|------|
| 入向 `SrcIpPrefix` | Query #3 `AddressesV4` 经 /32 ∥ /24 ∥ /16 聚合 | Mux 宿主机 PA |
| 入向 `DstIpPrefix` | Query #1/#2 `AddressesV4`（= VPNGW NodeIp）+ `/32` | VPNGW 实例宿主机 PA |
| 反向 `SrcIpPrefix` | Query #0 `VIPAddress` + `/32` | VPNGW 前端 VIP |
| 反向 `DstIpPrefix` | `onpremPublicIp` + `/32` | 对端 on-prem VPN 设备公网 IP |
| `SrcPort` / `DstPort` / `Protocol` / `TcpFlags` / `Dscp` | 固定 0 | 抓所有协议端口 |

> ✅ **为什么入向是笛卡尔积？** on-prem 的一个 IPsec 会话从 Mux 入流量经 5-tuple hash 选中**任一** Mux 实例，再封装发到承载 VPNGW 实例的**任一**宿主机 PA，事先无法预测命中哪一对，所以 N×M 全配对才能保证抓到。
>
> ✅ **为什么反向只有一条？** VPNGW 实例出方向流量经 SNAT 后源 IP 已重写为 VPNGW VIP，目标为 on-prem 公网 IP，TOR 看到的是解封装后的 5-tuple，一条够用。

### 6.3 Filter JSON 排版格式（同 everflow-slb A.3）

同一份 filter 可按粘贴目标输出为 3 种等价排版：标准缩进（`*.json`）、紧凑单行（`*-compact.json`）、**每行一条 rule**（`*-lines.json`，推荐，便于多行粘贴与逐条核对）。

---

## 七、端到端示例（真实数据）

**输入**：
- `subscriptionId` = `7ab07b40-8512-43d8-8013-2e63c625027a`
- `vpngwName` = `VNG-HEC60-HUI-01`
- `onpremPublicIp` = `113.108.104.170/32`
- 时间范围：最近 2 天

**Query #0**：`VIPAddress = 159.27.84.111`，GatewayId = `da970049-579d-4b7a-971a-76dacc23c7f3`，GatewayType = `DynamicRouting`，GatewayDeploymentType = `VMScaleSet`（→ 走 Query #2），Region = China North 3。

**Query #1**：空（符合预期，VMSS 部署）。

**Query #2（2 个 VPNGW 实例）**：

| nodeId | NodeIp (AddressesV4) | TOR |
|--------|---------------------|-----|
| e980b07a… | 10.69.3.154 | zqz25-0101-0804-12t0 |
| 2bdd5840… | 10.145.73.140 | zqz23-0101-0804-08t0 |

**Query #3（VIP 159.27.84.111 → 14 个 Mux 实例，2 个 Ring：r002/r005）**，Mux PA 聚合：

| 粒度 | 去重后集合数 |
|------|----------|
| /32 | 14 |
| /24 | 9 |
| /16 | 2（`10.145.0.0/16`、`10.168.0.0/16`） |

**最终输出（4 个文件）**：

```
everflow-vpngw-tors.txt            — zqz25-0101-0804-12t0,zqz23-0101-0804-08t0
everflow-vpngw-filter-mux32.json   — 14 × 2 + 1 = 29 条（28 入向 + 1 反向）
everflow-vpngw-filter-mux24.json   — 9  × 2 + 1 = 19 条
everflow-vpngw-filter-mux16.json   — 2  × 2 + 1 = 5 条
```

`everflow-vpngw-filter-mux16.json` 内容（每行一条 rule 格式）：

```json
[
{"SrcIpPrefix":"10.145.0.0/16","DstIpPrefix":"10.69.3.154/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
{"SrcIpPrefix":"10.145.0.0/16","DstIpPrefix":"10.145.73.140/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
{"SrcIpPrefix":"10.168.0.0/16","DstIpPrefix":"10.69.3.154/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
{"SrcIpPrefix":"10.168.0.0/16","DstIpPrefix":"10.145.73.140/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
{"SrcIpPrefix":"159.27.84.111/32","DstIpPrefix":"113.108.104.170/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

> 最后一条即出向反向规则：`VPNGW VIP 159.27.84.111 → on-prem 113.108.104.170`。

---

## 八、与 everflow-slb / everflow-ergw 的区别

| 维度 | everflow-slb（后端 VM 侧） | everflow-ergw | everflow-vpngw |
|------|--------------------------|---------------|----------------|
| 后端来源 | `DipEndpointProbeHistoryEvent` | `GatewayTenantHealth`（Dedicated） | `GatewayTenantHealth`（非 Dedicated） |
| 后端部署 | VM | ERGW 实例（CS / VMSS） | VPNGW 实例（CS / VMSS） |
| 入向规则 | Mux PA × 后端 NodeIp | Mux PA × ERGW NodeIp | Mux PA × VPNGW NodeIp |
| 反向规则 | 有 1 条 `SLBVIP→SrcVIP` | **无**（仅入向） | 有 1 条 `VPNGW VIP→on-prem 公网 IP` |
| 额外输入 | srcPublicIp（客户端公 IP） | 无 | **onpremPublicIp（对端公网 IP）** |
| 抓包点 | 后端 VM TOR（+ 可选 Mux 前端 TOR） | ERGW 实例 TOR | VPNGW 实例 TOR |

---

## 相关 Skills

- [`everflow-ergw.md`](./everflow-ergw.md) — ExpressRoute Gateway 场景（仅入向，无反向规则）
- [`everflow-slb.md`](./everflow-slb.md) — SLB 后端 VM 场景（含 Mux 前端侧抓包）
- [`everflow-vm-to-vm.md`](./everflow-vm-to-vm.md) — VM 到 VM 直连场景
