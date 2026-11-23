---
name: everflow-ergw
description: ExpressRoute Gateway（ERGW）场景下，准备 Everflow 抓包配置。输入 subscriptionId + ERGW 名称（或 ERGW resource ID），自动查询该 ERGW 的 VIPAddress、所有 ERGW 实例节点的 NodeIp/TOR（兼容 Cloud Service 与 VMSS 两种部署），并以 VIP 反查所有 SLB Mux 实例的 PA/TOR，最终输出：ERGW 实例侧 TOR 列表 + 3 份入向 filter（Mux PA 分别按 /32、/24、/16 聚合）。⚠️ ERGW 只有入向流量，不生成反向规则。触发词：everflow ERGW、ERGW 抓包、ExpressRoute Gateway 抓包、专线网关抓包、ERGW VIP 抓包、ER 网关入流量抓包
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
    description: ERGW 所在订阅 ID。若用户给的是 ERGW resource ID，则从中解析（/subscriptions/{subId}/...）
  - name: ergwName
    required: true
    description: ERGW 名称（如 WuXi_ER_VDI1）。若给的是 resource ID，则取末段 virtualNetworkGateways/{name}
  - name: startTime
    required: false
    description: 查询开始时间（UTC，ISO 8601）。默认 endTime - 2d
  - name: endTime
    required: false
    description: 查询结束时间（UTC，ISO 8601）。默认 now()
---

# ERGW 场景 Everflow 抓包准备

排查 ExpressRoute Gateway 入流量问题（如客户经 ER 专线访问 VNet 内资源异常、ERGW 实例丢包、连接超时）时，需要在 **所有 ERGW 实例所在 TOR** 上抓包，定位 Mux → ERGW 实例宿主机这一段封装流量。

## 一、数据平面（为什么这样抓）

ERGW 的前端 VIP 实际上是一个 **SLB VIP**，由该 Region 的若干 **SLB Mux** 实例（active-active）承载。一次入向会话的路径：

```
On-prem / Internet ──▶ ERGW VIP（= SLB VIP）──▶ SLB Mux（PA）──VxLAN/GRE 封装──▶ ERGW 实例宿主机（NodeIp）──▶ ERGW 实例
```

- 抓包点：**ERGW 实例宿主机的 TOR（T0）**
- 在该 TOR 上，入向报文的 5-tuple（外层）为：`SrcIp = Mux PA`，`DstIp = ERGW NodeIp`
- 一个 VIP 由 N 个 Mux 服务，一个 ERGW 由 M 个实例承载，事先无法预测命中哪一对 → **正向规则取 Mux PA × ERGW NodeIp 的笛卡尔积**

> 🚨 **ERGW 只有入向流量，没有出向流量** —— ERGW 实例的回程流量在 VFP/封装层处理后不经过同一抓包面，因此 **不生成任何反向规则**（这是与 `everflow-slb` 最大的区别：SLB 后端侧每份 filter 末尾会附 1 条 `SLBVIP→SrcVIP` 反向规则，ERGW 不需要）。

本 skill 自动到 `aznwmds` + `azurecm` + `azcrpmc` + `azslbmc` 跨集群关联查询，输出 **一组** 抓包准备文件（文件前缀 `everflow-ergw-`）：

- **TOR 列表**：所有 ERGW 实例所在 TOR
- **3 份 Everflow filter JSON**：Mux PA 分别按 `/32`、`/24`、`/16` 聚合，按抓包系统规则数上限灵活选择

---

## 二、输入解析

| 输入 | 含义 | 解析规则 |
|------|------|---------|
| **subscriptionId** | ERGW 所在订阅 | 直接用；或从 resource ID 的 `/subscriptions/{subId}/` 段提取 |
| **ergwName** | ERGW 名称 | 直接用；或从 resource ID 末段 `virtualNetworkGateways/{name}` 提取 |

> ERGW resource ID 形如：
> `/subscriptions/6ccaa7d8-.../resourceGroups/WuXiVDI_1/providers/Microsoft.Network/virtualNetworkGateways/WuXi_ER_VDI1`
> → subId = `6ccaa7d8-...`，ergwName = `WuXi_ER_VDI1`

---

## 三、执行流程

```
Step 0: Query #0 - GatewayTenantHealth
        以 subId + ergwName 查 → VIPAddress、GatewayType、Region、GatewayDeploymentType
        · GatewayDeploymentType = CloudServiceExtendedSupport → 走 Query #1（Cloud Service 路径）
        · GatewayDeploymentType 为 VMSS 类 → 走 Query #2（VMSS 路径）
        · 不确定时两条都跑，哪条有结果用哪条
Step 1/2: 拿 ERGW 实例节点的 TOR + NodeIp(AddressesV4)
        · Query #1（Cloud Service ERGW）
        · Query #2（VMSS ERGW）
Step 3: Query #3 - 以 VIPAddress 反查所有 SLB Mux 实例的 PA(AddressesV4) + TOR
Step 4: 聚合 Mux PA
        - /32 集合：Q#3 全部 AddressesV4，保留原样
        - /24 集合：每个 PA 前 3 段 + ".0/24"，去重
        - /16 集合：每个 PA 前 2 段 + ".0.0/16"，去重
Step 5: 组装输出（everflow-ergw-*）
        - TOR 列表 = unique(ERGW 实例 TOR)，逗号分隔
        - 3 份 filter（mux32/mux24/mux16），仅正向：
            · SrcIpPrefix = Mux PA（按 /32 或 /24 或 /16）
            · DstIpPrefix = ERGW NodeIp/32
            · 不含反向规则
```

> Query #1、#2、#3 互不依赖，可并行；Query #0 必须先跑（提供 VIPAddress 给 Query #3、判断部署类型）。

---

## 四、核心查询模板

> 公共变量：
> ```kql
> let ERGWNAME = '{ergwName}';
> let subid = '{subscriptionId}';
> let _startTime = datetime({startTime});
> let _endTime   = datetime({endTime});
> ```

### Query #0 — ERGW 的 VIPAddress 与部署类型

```kql
let ERGWNAME = '{ergwName}';
let subid = '{subscriptionId}';
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
cluster('aznwchinamc.chinanorth2').database('aznwmds').GatewayTenantHealth
| where PreciseTimeStamp >= _startTime - 1d and PreciseTimeStamp <= _endTime
| where CustomerSubscriptionId == subid
| where GatewayName == ERGWNAME
| distinct GatewayName, GatewayId, GatewayVmSize, VIPAddress, ProvisioningState,
           VNetName, GatewayTenantVersion, GatewayType, Region,
           GatewayDeploymentType, AzureDeploymentVmSize, PhysicalZones
```

**字段提取**：

| 输出列 | 用途 |
|--------|------|
| `VIPAddress` | 喂给 Query #3 反查 Mux PA；它是一个 SLB VIP |
| `GatewayType` | ERGW 通常为 `Dedicated` |
| `GatewayDeploymentType` | 判断走 Query #1（`CloudServiceExtendedSupport`）还是 Query #2（VMSS） |
| `Region` | 定位集群 |

### Query #1 — ERGW 实例节点 TOR + NodeIp（Cloud Service 路径）

```kql
let ERGWNAME = '{ergwName}';
let subid = '{subscriptionId}';
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
let NodeIds =
    cluster('aznwchinamc.chinanorth2').database('aznwmds').GatewayTenantHealth
    | where PreciseTimeStamp >= _startTime - 1d and PreciseTimeStamp <= _endTime
    | where CustomerSubscriptionId == subid
    | where GatewayName == ERGWNAME
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
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks | project StartDevice, StartPort, EndDevice, EndPort) on $left.DeviceName == $right.StartDevice
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceStatic | project Cluster, Regions, DeviceName) on $left.DeviceName == $right.DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface | where isnotempty(AddressesV4) | where InterfaceName =~ 'HostIP') on DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface | where isnotempty(AddressesV6) | where InterfaceName =~ 'HostIP1') on DeviceName
| extend nodeId = tolower(NodeId)
| project Regions, Cluster, nodeId, ServerName=StartDevice, ServerPort=StartPort, TOR=EndDevice, TORPort=EndPort, AddressesV4
```

### Query #2 — ERGW 实例节点 TOR + NodeIp（VMSS 路径）

```kql
let ERGWNAME = '{ergwName}';
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
let GatewayIds =
    cluster('aznwchinamc.chinanorth2').database('aznwmds').NrpResourceUriMappingTable
    | where isnotempty(ERGWNAME)
    | where NrpResourceUri has ERGWNAME
    | where ResourceType == 'VirtualNetworkGateway'
    | summarize ST=min(Timestamp), ET=max(Timestamp) by GatewayId=Id, Location
    | project GatewayId;
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
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks | project StartDevice, StartPort, EndDevice, EndPort) on $left.DeviceName == $right.StartDevice
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceStatic | project Cluster, Regions, DeviceName, HardwareSku, OSVersion, Vender, FirmwareProfile) on $left.DeviceName == $right.DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface | where isnotempty(AddressesV4) | where InterfaceName =~ 'HostIP') on DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface | where isnotempty(AddressesV6) | where InterfaceName =~ 'HostIP1') on DeviceName
| extend nodeId = tolower(NodeId)
| project Regions, Cluster, nodeId, ServerName=StartDevice, ServerPort=StartPort, TOR=EndDevice, TORPort=EndPort, HardwareSku, OSVersion, Vender, FirmwareProfile, AddressesV4
```

> 💡 Cloud Service ERGW 跑 Query #1 出结果、Query #2 为空；VMSS ERGW 反之。不确定时两条都跑。

**字段提取（Query #1 / #2 共同）**：

| 输出列 | 用途 |
|--------|------|
| `TOR` | ERGW 实例所在 TOR，加入 TOR 列表（抓包点） |
| `AddressesV4` | ERGW 实例宿主机 PA（= NodeIp），用作 filter 的正向 `DstIpPrefix` |

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
| `AddressesV4` | Mux 宿主机 PA → filter 正向 `SrcIpPrefix`（按 /32∥/24∥/16 聚合） |
| `tenantName` | SLB Ring 名称（一个 VIP 常由多 Ring × 多 Mux 实例承载） |
| `TOR` | Mux 端 TOR（本 skill 不抓 Mux 侧，仅供参考） |

---

## 五、关键坑（必读）

1. **`Servers.NodeId` 是大写，`LogContainerSnapshot.nodeId` 是小写** → 用 `where NodeId in (NodeIds)` 会因大小写不一致命中 0 行、整条查询返回空。**必须用 `in~`（大小写不敏感）**，或在子查询里统一大小写。Query 末尾的 `extend nodeId=tolower(NodeId)` 也印证了该表 NodeId 是大写。
2. **VIP 是 SLB VIP**：ERGW 的 `VIPAddress` 由 SLB Mux 承载，所以正向 `SrcIpPrefix` 来自 Query #3 的 Mux PA，而不是 ERGW 自身地址。
3. **只有入向、不要反向规则**：ERGW 不生成 `VIP→Client` 之类反向规则。
4. **部署类型决定路径**：`CloudServiceExtendedSupport` 走 Query #1，VMSS 走 Query #2；拿不准就两条都跑。

---

## 六、输出格式（文件前缀 `everflow-ergw-`）

### 6.1 TOR 列表 — `everflow-ergw-tors.txt`

```
{TOR_ergw_1},{TOR_ergw_2},...,{TOR_ergw_M}
```

- 取 Query #1 或 #2 的所有 `TOR`，去重后逗号分隔（不带空格）

### 6.2 Everflow Filter（3 份 JSON，按 Mux PA 聚合粒度区分）

每份 JSON 结构相同，**仅正向规则，无反向规则**：

```json
[
  {"SrcIpPrefix":"{MuxPA_aggregated}","DstIpPrefix":"{ErgwNodeIp_x}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  ...
]
```

三种聚合粒度：

| 文件 | Mux PA 形式 | 聚合方式 | 规则数 | 适用场景 |
|------|------------|----------|-------|---------|
| `everflow-ergw-filter-mux32.json` | `a.b.c.d/32` | Q#3 原始 PA 逐个保留 | **N × M** | 默认；规则数在抓包系统上限内时首选（最精确） |
| `everflow-ergw-filter-mux24.json` | `a.b.c.0/24` | 每个 PA 取前 3 段 + `.0/24`，去重 | **N_24 × M** | 规则超限或想适度合并 Mux；可能引入同 /24 噪声 |
| `everflow-ergw-filter-mux16.json` | `a.b.0.0/16` | 每个 PA 取前 2 段 + `.0.0/16`，去重 | **N_16 × M** | 规则数极度受限；通常 N_16 ≤ 3，最简洁；噪声最大 |

> N = Mux PA 个数（/32），M = ERGW 实例数；N_24、N_16 是按 /24、/16 去重后的子网数。
>
> 实测一个 Region 内 Mux PA 通常落在 2~3 个 /16 内，所以 `/16` 版本规则数极少，**最适合规则数受限的抓包系统**；用 Wireshark `ip.src` 反向过滤即可剔除误抓。

字段映射：

| Filter 字段 | 来源 | 说明 |
|------------|------|------|
| 正向 `SrcIpPrefix` | Query #3 `AddressesV4` 经 /32 ∥ /24 ∥ /16 聚合 | Mux 宿主机 PA |
| 正向 `DstIpPrefix` | Query #1/#2 `AddressesV4`（= ERGW NodeIp）+ `/32` | ERGW 实例宿主机 PA |
| `SrcPort` / `DstPort` / `Protocol` / `TcpFlags` / `Dscp` | 固定 0 | 抓所有协议端口 |

---

## 七、端到端示例（真实数据）

**输入**：
- `subscriptionId` = `6ccaa7d8-33f3-4973-a7c7-043fd70e0bbc`
- `ergwName` = `WuXi_ER_VDI1`
- 时间范围：`2026-06-07T03:00:00Z ~ 2026-06-09T03:00:00Z`

**Query #0**：`VIPAddress = 40.73.96.90`，GatewayType = `Dedicated`，GatewayDeploymentType = `CloudServiceExtendedSupport`（→ 走 Query #1），Region = China East 2。

**Query #1（5 个 ERGW 实例）**：

| nodeId | NodeIp (AddressesV4) | TOR |
|--------|---------------------|-----|
| f1bd0d8d… | 100.92.62.11 | sha20-0101-0906-19t0 |
| 949d69bb… | 100.92.54.10 | sha20-0101-0906-15t0 |
| 5c1761c8… | 100.92.61.131 | sha20-0101-0906-13t0 |
| 252240ef… | 100.92.55.138 | sha20-0101-0906-18t0 |
| 42e3bda6… | 100.92.57.2 | sha20-0101-0906-04t0 |

**Query #2**：空（符合预期，Cloud Service 部署）。

**Query #3（VIP 40.73.96.90 → 21 个 Mux 实例，3 个 Ring：r007/r008/r014）**，Mux PA 聚合：

| 粒度 | 去重后集合数 |
|------|----------|
| /32 | 21 |
| /24 | 19 |
| /16 | 2（`10.188.0.0/16`、`10.110.0.0/16`） |

**最终输出（4 个文件）**：

```
everflow-ergw-tors.txt            — sha20-0101-0906-19t0,sha20-0101-0906-15t0,sha20-0101-0906-13t0,sha20-0101-0906-18t0,sha20-0101-0906-04t0
everflow-ergw-filter-mux32.json   — 21 × 5 = 105 条（仅正向）
everflow-ergw-filter-mux24.json   — 19 × 5 = 95 条（仅正向）
everflow-ergw-filter-mux16.json   — 2 × 5 = 10 条（仅正向）
```

`everflow-ergw-filter-mux16.json` 内容示例（节选）：

```json
[
  {"SrcIpPrefix":"10.188.0.0/16","DstIpPrefix":"100.92.62.11/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.188.0.0/16","DstIpPrefix":"100.92.54.10/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.110.0.0/16","DstIpPrefix":"100.92.62.11/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

---

## 八、与 everflow-slb 的区别

| 维度 | everflow-slb（后端 VM 侧） | everflow-ergw |
|------|--------------------------|---------------|
| 后端来源 | `DipEndpointProbeHistoryEvent`（VIP→DIP） | `GatewayTenantHealth` + `LogContainerSnapshot`（ERGW 实例） |
| 后端部署 | VM | ERGW 实例（Cloud Service / VMSS 两种路径） |
| 正向规则 | Mux PA × 后端 NodeIp | Mux PA × ERGW NodeIp |
| 反向规则 | 有 1 条 `SLBVIP→SrcVIP` | **无**（ERGW 仅入向） |
| 是否需要 srcPublicIp | 需要（反向 filter） | **不需要** |
| 抓包点 | 后端 VM TOR（+ 可选 Mux 前端 TOR） | ERGW 实例 TOR |
