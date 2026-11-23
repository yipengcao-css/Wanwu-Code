---
name: everflow-ercircuit
description: ExpressRoute Circuit（ER 专线）场景下，准备 Everflow 抓包配置。输入 ER circuit resource ID（或 subscriptionId + circuit 名称）以及 onprem/Azure 两侧 IP 网段，自动查询该 circuit 的两台 MSEE 设备（PrimaryDeviceName/SecondaryDeviceName）与子接口名（InterfaceName），最终输出：MSEE 设备 + 子接口抓包点列表 + 1 份双向 filter（onprem↔Azure）。⚠️ MSEE 子接口能同时看到双向流量，filter 需正反两条规则。触发词：everflow ER circuit、ER 专线抓包、ExpressRoute circuit 抓包、MSEE 抓包、专线子接口抓包、circuit 双向抓包
tables:
  - cluster('aznwchinamc.chinanorth2').database('aznwmds').CircuitTable
  - cluster('aznwchinamc.chinanorth2').database('aznwmds').SubIntfTable
parameters:
  - name: erCircuitResourceId
    required: false
    description: ER circuit resource ID（/subscriptions/{subId}/.../expressRouteCircuits/{name}）。给了它就从中解析 subscriptionId 与 circuitName
  - name: subscriptionId
    required: false
    description: ER circuit 所在订阅 ID。未给 resource ID 时必填
  - name: circuitName
    required: false
    description: ER circuit 名称（如 ER_WuXi）。未给 resource ID 时必填
  - name: onpremPrefix
    required: true
    description: onprem（客户本地）侧 IP 地址或网段，形如 192.168.1.0/24 或 10.1.2.3/32。用作 filter 的 SrcIP（正向）/DstIP（反向）
  - name: azurePrefix
    required: true
    description: Azure 侧 IP 地址或网段，形如 10.0.0.0/16 或 10.0.0.4/32。用作 filter 的 DstIP（正向）/SrcIP（反向）
  - name: startTime
    required: false
    description: 查询开始时间（UTC，ISO 8601）。默认 endTime - 2d
  - name: endTime
    required: false
    description: 查询结束时间（UTC，ISO 8601）。默认 now()
---

# ER Circuit 场景 Everflow 抓包准备

排查 ExpressRoute 专线问题（如 onprem ↔ Azure 互通异常、丢包、单向不通、BGP/路由问题）时，需要在该 circuit 落地的 **两台 MSEE（Microsoft Enterprise Edge / PE 路由器）** 的 **circuit 子接口** 上抓包。

## 一、数据平面（为什么这样抓）

ER 专线在微软侧落在一对冗余的 MSEE（设备名形如 `*-gmr-cis-1` / `*-gmr-cis-2`）上，每条 circuit 对应 MSEE 上一个 dot1q 子接口（如 `TenGigabitEthernet0/1/0.6104`，VLAN 6104）。流量路径：

```
On-prem ◀──▶ Service Provider ◀──▶ MSEE Primary / Secondary（circuit 子接口）◀──▶ Microsoft 骨干 ◀──▶ ERGW ◀──▶ VNet
                                          ▲ 抓包点
```

- 抓包点：**两台 MSEE 的 circuit 子接口**（Primary + Secondary 都要，流量可能走任一台）
- 在 MSEE 子接口上能 **同时看到双向流量**（onprem→Azure 与 Azure→onprem 均为已路由的明文 5-tuple）
- 因此 **filter 需要正反两条规则**（这是与 `everflow-ergw` 的关键区别：ERGW 仅入向、无反向；ER circuit 双向、有反向）

> ⚠️ filter 里的 `onpremPrefix`（SrcIP）和 `azurePrefix`（DstIP）**由用户提供**，查询结果里没有这两个网段 —— 查询只负责定位「在哪台设备、哪个接口」抓包。

本 skill 到 `aznwmds` 查询，输出 **一组** 抓包准备文件（文件前缀 `everflow-ercircuit-`）：

- **MSEE 抓包点列表**：两台 MSEE 设备名 + circuit 子接口名
- **1 份 Everflow filter JSON**：双向（onprem↔Azure）共 2 条规则

---

## 二、输入解析

| 输入 | 含义 | 解析规则 |
|------|------|---------|
| **erCircuitResourceId** | ER circuit 资源 ID | 从 `/subscriptions/{subId}/` 取 subscriptionId，从末段 `expressRouteCircuits/{name}` 取 circuitName |
| **subscriptionId / circuitName** | 订阅 + circuit 名 | 未给 resource ID 时直接用 |
| **onpremPrefix** | onprem 侧 IP/网段 | 正向 `SrcIpPrefix`、反向 `DstIpPrefix` |
| **azurePrefix** | Azure 侧 IP/网段 | 正向 `DstIpPrefix`、反向 `SrcIpPrefix` |

> ER circuit resource ID 形如：
> `/subscriptions/6ccaa7d8-.../resourceGroups/WuXiVDI_1/providers/Microsoft.Network/expressRouteCircuits/ER_WuXi`
> → subId = `6ccaa7d8-...`，circuitName = `ER_WuXi`

---

## 三、执行流程

```
Step 1: 解析输入 → subscriptionId、circuitName、onpremPrefix、azurePrefix
Step 2: Query #1 - CircuitTable ⋈ SubIntfTable
        以 subId + circuitName 查 → PrimaryDeviceName、SecondaryDeviceName、InterfaceName(子接口)
        （同时拿 ServiceKey、Region、Bandwidth、PortPairId、PhyInterface 供参考）
Step 3: 组装输出（everflow-ercircuit-*）
        - 抓包点列表 = 两台 MSEE 设备名 + circuit 子接口名
        - Everflow Filter 1 份，双向 2 条：
            · 正向：SrcIpPrefix = onpremPrefix，DstIpPrefix = azurePrefix
            · 反向：SrcIpPrefix = azurePrefix，DstIpPrefix = onpremPrefix
```

---

## 四、核心查询模板

### Query #1 — circuit 的两台 MSEE 设备与子接口

```kql
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
let subid = '{subscriptionId}';
let ExpressRouteCircuitName = '{circuitName}';
cluster("aznwchinamc.chinanorth2").database("aznwmds").CircuitTable
| where PreciseTimeStamp >= _startTime - 1d and PreciseTimeStamp <= _endTime + 1d
| where AzureSubscriptionId == subid
| where CircuitName == ExpressRouteCircuitName
| join kind=leftouter cluster("aznwchinamc.chinanorth2").database("aznwmds").SubIntfTable
    on $left.AzureServiceKey == $right.ServiceKey
| extend PhyInterface = tostring(split(InterfaceName, ".")[0])
| distinct CircuitName, AzureServiceKey, Location, BillingType, DedicatedCircuitStatus,
           ResourceURI = replace("https://[^/]+", "", NrpResourceUri), PortPairId,
           ServiceProviderProvisioningState, Bandwidth, ServiceProviderName, Region,
           PrimaryDeviceName, SecondaryDeviceName, AllowGlobalReach, PhyInterface, InterfaceName
```

**字段提取**：

| 输出列 | 用途 |
|--------|------|
| `PrimaryDeviceName` | 主 MSEE 设备名，加入抓包点列表 |
| `SecondaryDeviceName` | 备 MSEE 设备名，加入抓包点列表 |
| `InterfaceName` | circuit 在 MSEE 上的子接口（含 dot1q VLAN，如 `...0.6104`），抓包接口 |
| `PhyInterface` | 物理母接口（去掉 `.vlan`），供参考 |
| `AzureServiceKey` | circuit ServiceKey，关联其它表 |
| `Region` / `Bandwidth` / `PortPairId` / `ServiceProviderName` | 上下文信息 |

> 💡 一条 circuit 通常返回主备两台 MSEE 与各自的子接口（可能同名 VLAN）。**主备都要抓**，因为流量可能哈希到任一台。
> 💡 若 `distinct` 返回多行（多 peering / 多子接口），把所有 `InterfaceName` 都纳入抓包接口列表。

---

## 五、输出格式（文件前缀 `everflow-ercircuit-`）

### 5.1 抓包点列表 — `everflow-ercircuit-msee.txt`

```
{PrimaryDeviceName},{SecondaryDeviceName}
{InterfaceName}    ->MSEE抓包必须在everflow的portal指定子接口
```

- 第 1 行：两台 MSEE 设备名，逗号分隔（不带空格）
- 第 2 行：circuit 子接口名（多子接口时逗号分隔），并在行尾附备注 `->MSEE抓包必须在everflow的portal指定子接口`

### 5.2 Everflow Filter — `everflow-ercircuit-filter.json`

**双向 2 条规则**：

```json
[
  {"SrcIpPrefix":"{onpremPrefix}","DstIpPrefix":"{azurePrefix}","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{azurePrefix}","DstIpPrefix":"{onpremPrefix}","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

字段映射：

| Filter 字段 | 来源 | 说明 |
|------------|------|------|
| 正向 `SrcIpPrefix` | `onpremPrefix` | onprem 侧 IP/网段 |
| 正向 `DstIpPrefix` | `azurePrefix` | Azure 侧 IP/网段 |
| 反向 `SrcIpPrefix` | `azurePrefix` | Azure 侧 IP/网段 |
| 反向 `DstIpPrefix` | `onpremPrefix` | onprem 侧 IP/网段 |
| `SrcPort` / `DstPort` / `Protocol` / `TcpFlags` / `Dscp` | 固定 0 | 抓所有协议端口 |

> ✅ **为什么是双向两条？**
> MSEE 子接口是 onprem 与 Azure 之间的路由转发点，两个方向的明文报文都在此经过。要完整还原一次会话（含单向丢包定位），必须同时抓 onprem→Azure 与 Azure→onprem。
>
> ⚠️ **网段粒度**：`onpremPrefix`/`azurePrefix` 用 `/32` 抓单 IP 对、用 `/24`、`/16` 等抓网段。范围越大噪声越多，但能覆盖整个互通范围；可在 Wireshark 里二次过滤。

---

## 六、端到端示例（真实数据）

**输入**：
- `erCircuitResourceId` = `/subscriptions/6ccaa7d8-33f3-4973-a7c7-043fd70e0bbc/resourceGroups/WuXiVDI_1/providers/Microsoft.Network/expressRouteCircuits/ER_WuXi`
- `onpremPrefix` = `192.168.1.0/24`（示例，客户提供）
- `azurePrefix` = `10.0.0.0/16`（示例，客户提供）
- 时间范围：`2026-06-07T03:00:00Z ~ 2026-06-09T03:00:00Z`

**解析**：subId = `6ccaa7d8-33f3-4973-a7c7-043fd70e0bbc`，circuitName = `ER_WuXi`。

**Query #1 结果**：

| 字段 | 值 |
|------|----|
| PrimaryDeviceName | `sha20-06gmr-cis-1` |
| SecondaryDeviceName | `sha20-06gmr-cis-2` |
| InterfaceName | `TenGigabitEthernet0/1/0.6104` |
| AzureServiceKey | `61dc9cc2-2c5a-4dc7-8a7c-c99e888d6430` |
| Region | China East 2 |
| Bandwidth | 2000 Mbps |
| ServiceProviderName | gds |

**最终输出（2 个文件）**：

`everflow-ercircuit-msee.txt`：
```
sha20-06gmr-cis-1,sha20-06gmr-cis-2
TenGigabitEthernet0/1/0.6104    ->MSEE抓包必须在everflow的portal指定子接口
```

`everflow-ercircuit-filter.json`：
```json
[
  {"SrcIpPrefix":"192.168.1.0/24","DstIpPrefix":"10.0.0.0/16","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.0.0.0/16","DstIpPrefix":"192.168.1.0/24","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

---

## 七、与其它 everflow skill 的区别

| 维度 | everflow-ercircuit | everflow-ergw | everflow-slb |
|------|--------------------|---------------|--------------|
| 抓包点 | MSEE 主备子接口 | ERGW 实例 TOR | 后端 VM TOR（+ Mux TOR） |
| 抓包层 | 物理 PE 路由器子接口（明文路由流量） | 宿主机 TOR（PA 封装流量） | 宿主机 TOR（PA 封装流量） |
| filter Src/Dst | onprem ↔ Azure 网段（用户提供） | Mux PA → ERGW NodeIp | Mux PA → 后端 NodeIp |
| 方向 | **双向**（正+反 2 条） | 仅入向（无反向） | 后端侧含 1 条反向 |
| 关键查询表 | CircuitTable ⋈ SubIntfTable | GatewayTenantHealth + LogContainerSnapshot | DipEndpointProbeHistoryEvent + VipRangesSnapshotEvent |
| 是否需用户提供 IP | 需要（onprem + Azure 网段） | 不需要 | 需要 srcPublicIp（反向用） |
