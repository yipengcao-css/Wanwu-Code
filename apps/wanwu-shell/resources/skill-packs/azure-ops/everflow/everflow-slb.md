---
name: everflow-slb
description: SLB（Standard Load Balancer）场景下，准备 Everflow 抓包配置。输入源公网 IP 和 SLB VIP（或 SLB resource ID），自动查询 VIP 所有后端 VM 的 ContainerId/NodeIp/TOR，以及 SLB Ring（Mux）实例的 PA/TOR，最终输出两组文件：(1) 后端 VM 侧：TOR 列表 + 3 份 filter（Mux PA 分别按 /32、/24、/16 聚合 + SLB→Client 反向）；(2) Mux 前端侧：Mux TOR 列表 + 1 条入向 filter（Client→SLB VIP）。**同样适用于 Application Gateway 和 Azure Firewall**：它们的前端 VIP 本质就是 SLB VIP，其实例就是本 skill 查到的"后端 DIP"（roleInstanceName 形如 _appgw_* / azfw 实例），所以排查 AppGW / AzFW 公网入流量时，用户只需提供「源公网 IP + AppGW/AzFW 的 VIP」，直接用本 skill 即可生成对应 TOR 和 filter，无需任何额外步骤。若 VIP 直接绑定到后端 VM 网卡（无 LB DIP 健康探测端点），DipEndpointProbeHistoryEvent 会查不到后端，需回退到 OutboundProbeResultHistoryEvent 取 ContainerId。触发词：everflow SLB、SLB 抓包、Mux 抓包、SLB VIP 抓包、SLB 公网入流量抓包、VIP 直接绑定网卡抓包、Application Gateway 抓包、AppGW VIP 抓包、Azure Firewall 抓包、AzFW VIP 抓包
tables:
  - cluster('azslbmc').database('azslbmdsmc').DipEndpointProbeHistoryEvent
  - cluster('azslbmc').database('azslbmdsmc').OutboundProbeResultHistoryEvent
  - cluster('azslbmc').database('azslbmdsmc').VipRangesSnapshotEvent
  - cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceStatic
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceIpInterface
parameters:
  - name: srcPublicIp
    required: true
    description: 客户端源公网 IP 地址（SrcVIP），用于反向 filter 的目标地址
  - name: slbVipOrResourceId
    required: true
    description: SLB VIP（如 40.162.93.144），或 Application Gateway / Azure Firewall 的前端公网 VIP，或 SLB resource ID。若给的是 resource ID，需先查 NRP / ARG 解析出 VIP
  - name: startTime
    required: false
    description: 查询开始时间（UTC，ISO 8601）。默认 endTime - 2d
  - name: endTime
    required: false
    description: 查询结束时间（UTC，ISO 8601）。默认 now()
---

# SLB 场景 Everflow 抓包准备

> ✅ **适用范围（重要）**：本 skill 不仅用于普通 SLB，**同样直接适用于 Application Gateway（AppGW）和 Azure Firewall（AzFW）**。
> AppGW / AzFW 的前端公网 VIP 本质上就是一个 **SLB VIP**，其网关实例（roleInstanceName 形如 `_appgw_0`/`_appgw_2`、AzFW 实例等）就是 `DipEndpointProbeHistoryEvent` 里该 VIP 的"后端 DIP"。
> 因此排查 **AppGW / AzFW 公网入流量**问题时，用户**只需提供两项输入**：① 源公网 IP（`srcPublicIp`）；② AppGW / AzFW 的 VIP（`slbVipOrResourceId`）。其余流程（查实例 TOR/NodeIp、查 Mux PA/TOR、生成 filter）与普通 SLB **完全一致，无需任何额外步骤**。
> - 后端 VM 侧 filter 抓到的是 **Mux → AppGW/AzFW 实例宿主机**这一段封装流量；
> - ⚠️ AppGW/AzFW 实例再到其**真实后端**（如后端 Web 服务器、下一跳 nginx VM 等）是**另一段**流量，不在本 skill 范围内，需要时单独再抓。**请参考 [`everflow-vm-to-vm.md`](./everflow-vm-to-vm.md) skill 去生成实例到真实后端节点的 filter。**

排查 SLB 公网入流量问题（如客户端访问 SLB VIP 出错、健康探测异常、连接超时）时，要在**所有 Mux 节点**和**所有后端 VM 节点**两端 TOR 上同时抓包，才能完整还原一次会话的两段路径：

```
Client(SrcVIP) ──▶ Internet ──▶ Mux(PA) ──VxLAN/GRE 封装──▶ Backend VM Host(NodeIp) ──▶ VM
                                  ▲                                          │
                                  └─────── 返程：SLB VIP → SrcVIP ◀──────────┘
```

本 skill 自动到 `azslbmc` + `azurecm` + `aznwmds` 跨集群关联查询，输出**两组**抓包准备文件：

### A. 后端 VM 侧（文件前缀 `everflow-slb-backendVM-`）

- **TOR 列表**：仅包含**后端 VM 所在 TOR**
- **3 份 Everflow filter JSON**：Mux PA 分别按 `/32`、`/24`、`/16` 聚合，方便按规则数量上限灵活选择
  - `/32`：精确 Mux PA × 后端 NodeIp（规则最多，最精确）
  - `/24`：Mux PA 同 C 段聚合（规则减少，可能引入少量噪声）
  - `/16`：Mux PA 同 B 段聚合（规则最少，噪声最大但通常足以覆盖整 Region 的 Mux）
- 每份 filter 末尾都附带 1 条反向规则 `SLBVIP/32 → SrcVIP/32`（用于抓 backend → client 返程）

### B. Mux 前端侧（文件前缀 `everflow-slb-frontend-`）

- **TOR 列表**：仅包含**Mux 所在 TOR**
- **1 份 Everflow filter JSON**：**仅一条入向规则** `SrcVIP/32 → SLBVIP/32`
  - 原因：Mux 前端 T0 只能收集**入向**报文（客户端 → SLB VIP 原始包）；出向（Mux 经封装到后端宿主机）方向的包需要在后端 VM 侧 TOR 抓，已由 A 组覆盖。

---

## 一、输入解析

| 输入 | 含义 | 解析规则 |
|------|------|---------|
| **srcPublicIp** | 客户端公网 IP，发起到 SLB VIP 的访问 | 用作反向 filter 的 `DstIpPrefix` |
| **slbVipOrResourceId** | SLB 前端 VIP 或 LB resource ID | 形如 IPv4/IPv6 字面量则直接当 VIP；形如 `/subscriptions/.../loadBalancers/<lbName>` 则需先查 NRP 控制面或 ARG 拿到 frontendIPConfiguration.publicIP，从公 IP 资源里取地址 |

> ⚠️ **resource ID → VIP 转换**：如果用户只给了 LB resource ID，可走 Azure Resource Graph：
> ```kql
> Resources
> | where type =~ "microsoft.network/loadbalancers"
> | where id =~ "<lbResourceId>"
> | mv-expand props=properties.frontendIPConfigurations
> | extend publicIpId = tostring(props.properties.publicIPAddress.id)
> | join kind=inner (
>     Resources
>     | where type =~ "microsoft.network/publicipaddresses"
>     | project publicIpId = id, ipAddress = tostring(properties.ipAddress)
>   ) on publicIpId
> | project lbName = name, publicIpId, ipAddress
> ```

---

## 二、执行流程

```
Step 1: 解析输入 → SrcVIP（客户端公 IP）、SLBVIP（SLB VIP 字面量）
Step 2: Query #1 - DipEndpointProbeHistoryEvent
        以 SLBVIP 为条件，列出所有后端 DIP 端点
        → 提取每个后端 VM 的 ContainerId、NodeIp、PA、NodeId、Region 等
        ⚠️ 若 Query #1 返回空 → 该 VIP 多半是「直接绑定到后端 VM 网卡」场景
           （VIP 直挂 VM NIC，无标准 LB DIP 健康探测端点），转 Step 2b
Step 2b: Query #1b - OutboundProbeResultHistoryEvent（仅当 Query #1 为空时执行）
        以 SLBVIP 为条件，从出向探测历史记录中提取后端 VM
        → 提取每个后端 VM 的 ContainerId、HostIP(=NodeIp 等价)、PA、NodeId 等
        → 拿到 ContainerId 后，后续 Step 3 / Step 4 / Step 5 / Step 6 完全一致
Step 3: Query #2 - LogContainerSnapshot ⋈ aznwmds.*
        对每个后端 VM ContainerId 执行一次（或在一条查询中用 in() 批量）
        → 提取每个后端 VM 的 TOR、ServerName、AddressesV4（验证 NodeIp）
Step 4: Query #3 - VipRangesSnapshotEvent → LogContainerSnapshot ⋈ aznwmds.*
        以 SLBVIP 命中的 RingName 反查所有 Mux 容器
        → 提取每个 Mux 实例的 AddressesV4 (= Mux PA) 和 TOR
Step 5: 聚合 Mux PA
        - /32 集合：Q#3 全部 AddressesV4，保留原样
        - /24 集合：每个 PA 的前 3 段 + ".0/24"，去重
        - /16 集合：每个 PA 的前 2 段 + ".0.0/16"，去重
Step 6: 组装两组输出
   A. 后端 VM 侧（everflow-slb-backendVM-*）
      - TOR 列表 = unique(后端 TOR)，逗号分隔
      - Everflow Filter 共 3 份（mux32/mux24/mux16）：
          · 正向：所有 Mux PA（按 /32 或 /24 或 /16）× 所有后端 NodeIp 的笛卡尔积
          · 反向：1 条 SLBVIP/32 → SrcVIP/32
   B. Mux 前端侧（everflow-slb-frontend-*）
      - TOR 列表 = unique(Mux TOR)，逗号分隔
      - Everflow Filter 1 份，仅 1 条入向规则：
          · SrcIpPrefix = SrcVIP/32，DstIpPrefix = SLBVIP/32
```

> Query #2 和 Query #3 可以并行执行（互不依赖）。Query #1（或回退的 Query #1b）必须先跑，因为 Query #2 依赖它返回的 ContainerId 列表。

---

## 三、核心查询模板

### Query #1 — 找出 VIP 所有后端 DIP（VM）

```kql
let SLBVIPorILBVIP = '{slbVip}';
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
cluster('azslbmc').database('azslbmdsmc').DipEndpointProbeHistoryEvent
| where TIMESTAMP >= _startTime and TIMESTAMP <= _endTime
| where isnotempty(SLBVIPorILBVIP)
| where Vip == SLBVIPorILBVIP
| summarize TIMESTAMP = max(TIMESTAMP)
    by Vip, VipPort, DipCA, DipPort, Protocol, ProbePort, ProbeUrlPath, ProbeType,
       NodeIp = Ip, PA = ProbeAddress, ContainerId, NodeId, ProbeStatus, ProbeStatusReason,
       Region, VnetId, SubscriptionId, NrpLoadBalancerId, NrpPublicIpId
| project TIMESTAMP, Vip, VipPort, DipCA, DipPort, Protocol, ProbePort, ProbeUrlPath, ProbeType,
          NodeIp, PA, ContainerId, NodeId, ProbeStatus, ProbeStatusReason,
          Region, VnetId, SubscriptionId, NrpLoadBalancerId, NrpPublicIpId
| order by TIMESTAMP desc
```

**字段提取**：

| 输出列 | 用途 |
|--------|------|
| `ContainerId` | 喂给 Query #2 找后端 VM 所在 TOR |
| `NodeIp` | 后端 VM 宿主机 PA，用作 Everflow filter 的 `DstIpPrefix` |
| `DipCA` | 后端 VM 的 CA（Customer Address，VM 内部 IP），仅供参考 |
| `ProbeStatus` | 健康探测状态（Up / Down），筛选只看 Up 后端可加 `| where ProbeStatus == 'Up'` |

> 💡 如果后端 VM 数量很多（>50）想缩范围，可只保留 `ProbeStatus == 'Up'` 的实例；做完整抓包则全部保留。

---

### Query #1b — VIP 直接绑定到后端 VM 网卡场景（Query #1 返回空时回退）

> **何时用**：当 Query #1（`DipEndpointProbeHistoryEvent`）以 `Vip == SLBVIP` 查询返回**空结果**时，说明该 VIP **不是**标准 LB DIP（没有独立的健康探测端点），而是**直接绑定到后端 VM 网卡**的场景（VIP 直挂 VM NIC）。此时改用出向探测历史表 `OutboundProbeResultHistoryEvent` 反查承载该 VIP 的后端 VM 的 ContainerId。

```kql
let _endTime   = datetime({endTime});
let _startTime = datetime({startTime});
let ipv4address = '{slbVip}';
cluster('azslbmc').database('azslbmdsmc').OutboundProbeResultHistoryEvent
| where TIMESTAMP >= _startTime and TIMESTAMP <= _endTime
| where Vip == ipv4address
| where isnotempty(ContainerId)
| summarize ENDTIME = max(PreciseTimeStamp)
    by Vip, Ip, Dip, Cluster, DipCA, SubscriptionId, NrpLoadBalancerId,
       NodeId, ContainerId, AdapterId, VnetId, HostLocalIpAddress
| where ENDTIME >= _startTime
| project LastIngressTime = ENDTIME, Vip, ContainerId, DipCA, AdapterId,
          HostLocalIpAddress, PA = Dip, HostIP = Ip, Cluster, NodeId, VnetId
| order by LastIngressTime desc
```

**字段提取**：

| 输出列 | 用途 |
|--------|------|
| `ContainerId` | **喂给 Query #2** 找后端 VM 所在 TOR（下游用法与 Query #1 完全一致） |
| `HostIP` (= `Ip`) | 后端 VM 宿主机 PA，**等价于 Query #1 的 `NodeIp`**，用作 Everflow filter 的 `DstIpPrefix` |
| `PA` (= `Dip`) | DIP 侧地址，仅供参考 |
| `DipCA` | 后端 VM 的 CA（Customer Address，VM 内部 IP），仅供参考 |
| `NodeId` | 节点 ID，供与 Query #2 交叉校验 |
| `AdapterId` / `VnetId` / `HostLocalIpAddress` | 网卡/VNet 上下文，辅助确认 |

> 💡 **两表对应关系**：Query #1 用 `NodeIp = Ip`，Query #1b 用 `HostIP = Ip`，二者都取自同一个 `Ip` 列（后端 VM 宿主机 V4 PA），所以拿到 ContainerId 后**后续 Query #2 / Query #3 / 聚合 / 输出流程完全不变**。`DstIpPrefix` 优先用 Query #2 的 `AddressesV4`（权威），或直接用 Query #1b 的 `HostIP`。
>
> ⚠️ Query #1b 仍返回空时：扩大时间窗口（`ago(7d)`）、确认 VIP 拼写、或确认该 VIP 是否真由 SLB 承载（可能是纯 Instance-Level Public IP，不经 Mux）。

---

### Query #2 — 后端 VM 的 TOR 信息（按 ContainerId 批量）

```kql
let ContIds = dynamic([{containerIdList}]);  // e.g. ['f3ba360e-...', '792baad3-...']
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
| where PreciseTimeStamp >= _startTime and PreciseTimeStamp <= _endTime
| where isnotempty(containerId) and containerId in (ContIds)
| summarize arg_max(TIMESTAMP, *) by roleInstanceName, nodeId
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers
        | extend nodeId = tolower(NodeId))
        on $left.nodeId == $right.nodeId
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks
        | project StartDevice, StartPort, EndDevice, EndPort)
        on $left.DeviceName == $right.StartDevice
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceStatic
        | project Cluster, Regions, DeviceName, HardwareSku, OSVersion, Vender, FirmwareProfile)
        on $left.DeviceName == $right.DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface
        | where isnotempty(AddressesV4)
        | where InterfaceName =~ 'HostIP')
        on DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface
        | where isnotempty(AddressesV6)
        | where InterfaceName =~ 'HostIP1')
        on DeviceName
| order by TIMESTAMP
| project TIMESTAMP, Regions, Cluster, nodeId, containerId, roleInstanceName,
          ServerName = StartDevice, ServerPort = StartPort,
          TOR = EndDevice, TORPort = EndPort,
          HardwareSku, OSVersion, Vender, FirmwareProfile,
          AddressesV4
```

> ⚠️ 如果只想一次只查一个 ContainerId（与现有 vm-to-vm skill 写法一致），把 `containerId in (ContIds)` 改成 `containerId == ContId` 并设 `let ContId = '{containerId}';` 循环跑即可。批量 `in()` 模式更高效。

**与 Query #1 结果交叉验证**：Query #2 输出的 `AddressesV4` 应该 ≈ Query #1 的 `NodeIp`（两者都代表后端 VM 宿主机的 V4 PA）。不一致一般是查询时间窗口跨了 Live Migration。

---

### Query #3 — SLB Ring（Mux）实例的 PA 与 TOR

```kql
let SLBVIPorILBVIP = '{slbVip}';
let RingNames =
    cluster('azslbmc').database('azslbmdsmc').VipRangesSnapshotEvent
    | where env_time > ago(4h)
    | where isnotempty(SLBVIPorILBVIP)
    | where env_cloud_location != '<null>'
    | where ipv4_is_in_range(SLBVIPorILBVIP, VipRange) or ipv6_is_in_range(SLBVIPorILBVIP, VipRange)
    | summarize make_list(RingName);
cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
| where TIMESTAMP > ago(4h)
| where tenantName has_any (RingNames)
| summarize arg_max(TIMESTAMP, *) by tenantName, nodeId
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers
        | extend nodeId = tolower(NodeId))
        on $left.nodeId == $right.nodeId
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks
        | project StartDevice, StartPort, EndDevice, EndPort)
        on $left.DeviceName == $right.StartDevice
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceStatic
        | project Cluster, Regions, DeviceName)
        on $left.DeviceName == $right.DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface
        | where isnotempty(AddressesV4)
        | where InterfaceName =~ 'HostIP')
        on DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface
        | where isnotempty(AddressesV6)
        | where InterfaceName =~ 'HostIP1')
        on DeviceName
| project TIMESTAMP, Regions, Cluster, tenantName, nodeId, containerId, roleInstanceName,
          ServerName = StartDevice, ServerPort = StartPort,
          TOR = EndDevice, TORPort = EndPort,
          AddressesV4, AddressesV61
| sort by Regions, roleInstanceName
```

**字段提取**：

| 输出列 | 用途 |
|--------|------|
| `AddressesV4` | Mux 容器所在宿主机的 V4 PA → Everflow filter 的 `SrcIpPrefix`（正向规则） |
| `TOR` | Mux 端的 TOR 设备，加入 TOR 列表 |
| `tenantName` | Ring 名称，每个 Region 通常有多个 Ring，每 Ring 多个 Mux 实例 |

> 💡 一个 VIP 通常会被多个 Mux 实例同时服务（active-active），所以 Mux PA 通常是 3 ~ N 个。

---

## 四、输出格式

### A. 后端 VM 侧（文件前缀 `everflow-slb-backendVM-`）

#### A.1 TOR 列表 — `everflow-slb-backendVM-tors.txt`

```
{TOR_backend_1},{TOR_backend_2},...,{TOR_backend_M}
```

- 取 Query #2 的所有 `TOR`，去重后逗号分隔（不带空格）
- **不包含** Mux TOR（Mux 侧抓包参见 B 组）

#### A.2 Everflow Filter（3 份 JSON，按 Mux PA 聚合粒度区分）

每份 JSON 结构相同：

```json
[
  // 正向规则：所有 Mux PA × 所有后端 NodeIp 的笛卡尔积
  {"SrcIpPrefix":"{MuxPA_aggregated}","DstIpPrefix":"{BackendNodeIp_x}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  ...
  // 反向规则：1 条
  {"SrcIpPrefix":"{SLBVIP}/32","DstIpPrefix":"{SrcVIP}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

三种聚合粒度：

| 文件 | Mux PA 形式 | 聚合方式 | 规则数 | 适用场景 |
|------|------------|----------|-------|---------|
| `everflow-slb-backendVM-filter-mux32.json` | `a.b.c.d/32` | Q#3 原始 PA 逐个保留 | **N × M + 1** | 默认；规则数在抓包系统上限内时首选 |
| `everflow-slb-backendVM-filter-mux24.json` | `a.b.c.0/24` | 每个 PA 取前 3 段 + `.0/24`，去重 | **N_24 × M + 1** | 规则超限或想适度合并 Mux；可能引入同 /24 内其他主机流量 |
| `everflow-slb-backendVM-filter-mux16.json` | `a.b.0.0/16` | 每个 PA 取前 2 段 + `.0.0/16`，去重 | **N_16 × M + 1** | 规则数极度受限；通常 N_16 ≤ 3，最简洁；引入更大范围噪声 |

> N = Mux PA 个数（/32），M = 后端 VM 数；N_24、N_16 是按 /24、/16 去重后的子网数。
>
> 实测一个 Region 内 Mux PA 通常落在 2~3 个 /16 内，所以 `/16` 版本规则数极少，**最适合规则数受限的抓包系统**。

字段映射：

| Filter 字段 | 来源 | 说明 |
|------------|------|------|
| 正向 `SrcIpPrefix` | Query #3 `AddressesV4` 经 /32 ∥ /24 ∥ /16 聚合 | Mux 宿主机 PA |
| 正向 `DstIpPrefix` | Query #1 `NodeIp`（或 Query #1b `HostIP` / Query #2 `AddressesV4`） + `/32` | 后端 VM 宿主机 PA |
| 反向 `SrcIpPrefix` | `SLBVIP` + `/32` | SLB 前端 VIP |
| 反向 `DstIpPrefix` | `SrcVIP` + `/32` | 客户端公网 IP（用户输入的 srcPublicIp） |
| `SrcPort` / `DstPort` / `Protocol` / `TcpFlags` / `Dscp` | 固定 0 | 抓所有协议端口 |

> ✅ **为什么正向是笛卡尔积？**
> 客户端的一个 TCP 连接，从 Mux 入流量经 5-tuple hash 选中**任一** Mux 实例，然后该 Mux 把包封装发到承载后端 VM 的**任一**宿主机 PA。事先无法预测命中哪一对，所以 N×M 全配对才能保证抓到。
>
> ✅ **为什么反向只有一条？**
> 后端 VM 出方向流量在 VFP/SLB 层做 SNAT 后，源 IP 已重写为 SLB VIP，目标 IP 是客户端公 IP。这条规则在 TOR 看到的是 overlay 已解封装后的 5-tuple，所以一条够用。
>
> ⚠️ **关于聚合的噪声**：把 Mux PA 从 /32 扩到 /24 或 /16，相当于把同一 /24 / /16 内的其他主机（可能是同区域的存储、其他 Mux Ring、Compute 节点等）→ 后端 VM 的所有流量都抓进来。后端 VM 侧的 TOR 通常流量稀疏，这种"误抓"在分析时用 Wireshark `ip.src` 反向过滤一下即可剔除，影响有限。

#### A.3 Filter JSON 排版格式（3 种，按粘贴目标选择）

同一份 filter 内容可按抓包系统/粘贴框的要求，输出为以下 3 种排版（**内容完全等价，均为合法 JSON**）。建议默认产出 **每行一条 rule** 格式，最便于人工核对与逐条增删：

| 格式 | 文件后缀 | 说明 | 适用 |
|------|---------|------|------|
| **缩进美化** | `*.json` | 标准 `indent=2` 多行缩进 | 阅读、版本管理 diff |
| **紧凑单行** | `*-compact.json` | 整个数组压成一行，无空格 | 单行输入框、命令行参数 |
| **每行一条 rule**（推荐） | `*-lines.json` | 数组括号单独成行，每条 rule 压成一行，逗号换行 | 抓包 portal 多行粘贴、逐条核对/增删 |

**「每行一条 rule」格式示例**（以 mux16 为例）：

```json
[
{"SrcIpPrefix":"{MuxPA_16_1}","DstIpPrefix":"{BackendNodeIp}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
{"SrcIpPrefix":"{MuxPA_16_2}","DstIpPrefix":"{BackendNodeIp}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
{"SrcIpPrefix":"{SLBVIP}/32","DstIpPrefix":"{SrcVIP}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

> 生成方法：对每条 rule 用紧凑序列化（如 Python `json.dumps(rule, separators=(",",":"))`），再用 `",\n"` 连接，首尾补 `[` / `]` 单独成行。Mux 前端侧 filter（B.2）同样适用这 3 种格式。

---

### B. Mux 前端侧（文件前缀 `everflow-slb-frontend-`）

#### B.1 TOR 列表 — `everflow-slb-frontend-tors.txt`

```
{TOR_mux_1},{TOR_mux_2},...,{TOR_mux_K}
```

- 取 Query #3 的所有 `TOR`，去重后逗号分隔（不带空格）
- 包含命中该 VIP 的所有 Mux Ring 中**每个 Mux 实例**所在的 TOR

#### B.2 Everflow Filter — `everflow-slb-frontend-filter.json`

**只有一条入向规则**：

```json
[
  {"SrcIpPrefix":"{SrcVIP}/32","DstIpPrefix":"{SLBVIP}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

字段映射：

| Filter 字段 | 来源 | 说明 |
|------------|------|------|
| `SrcIpPrefix` | `SrcVIP` + `/32` | 客户端公网 IP（用户输入的 srcPublicIp） |
| `DstIpPrefix` | `SLBVIP` + `/32` | SLB 前端 VIP |
| 其余字段 | 固定 0 | 抓所有协议端口 |

> ✅ **为什么只一条？**
> Mux 前端 T0 只能收集**入向**报文：来自互联网的原始包，目的为 SLB VIP，源为客户端真实公 IP（尚未被任何 SLB 重写）。Mux 处理后会做 VxLAN/GRE 封装走向后端宿主机 PA，那段封装流量需要在**后端 VM 侧 TOR**抓（已由 A 组的正向规则覆盖），所以前端侧只需一条入向规则即可。

---

## 五、端到端示例

**输入**：

- `srcPublicIp` = `1.2.3.4`（客户端公网 IP）
- `slbVipOrResourceId` = `40.162.93.144`（SLB VIP）
- 时间范围：`2026-05-19T02:00:56Z ~ 2026-05-21T02:00:56Z`

**Query #1 结果**（假设 3 个后端 VM）：

| ContainerId | NodeIp | DipCA | ProbeStatus |
|-------------|--------|-------|-------------|
| `f3ba360e-...` | `10.50.1.12` | `10.0.0.4` | Up |
| `792baad3-...` | `10.37.195.18` | `10.0.0.5` | Up |
| `aabbccdd-...` | `10.50.1.25` | `10.0.0.6` | Up |

**Query #2 结果**（后端 VM TOR）：

| ContainerId | AddressesV4 | TOR |
|-------------|-------------|-----|
| `f3ba360e-...` | `10.50.1.12` | `zqz20-0101-0609-10t0` |
| `792baad3-...` | `10.37.195.18` | `zqz22-0101-0606-14t0` |
| `aabbccdd-...` | `10.50.1.25` | `zqz20-0101-0609-12t0` |

**Query #3 结果**（Mux PA + TOR，假设 2 个 Mux）：

| tenantName | AddressesV4 (Mux PA) | TOR |
|-----------|----------------------|-----|
| SLBRing_chinan3_01 | `10.60.0.10` | `zqz20-0101-0701-01t0` |
| SLBRing_chinan3_02 | `10.60.0.11` | `zqz20-0101-0701-02t0` |

**Mux PA 聚合**：

| 粒度 | 去重后集合 |
|------|----------|
| /32 | `10.60.0.10/32`, `10.60.0.11/32` |
| /24 | `10.60.0.0/24` |
| /16 | `10.60.0.0/16` |

**最终输出（两组共 6 个文件）**：

```
A. 后端 VM 侧:
   everflow-slb-backendVM-tors.txt           — zqz20-0101-0609-10t0,zqz22-0101-0606-14t0,zqz20-0101-0609-12t0
   everflow-slb-backendVM-filter-mux32.json  — 2 × 3 + 1 = 7 条
   everflow-slb-backendVM-filter-mux24.json  — 1 × 3 + 1 = 4 条
   everflow-slb-backendVM-filter-mux16.json  — 1 × 3 + 1 = 4 条

B. Mux 前端侧:
   everflow-slb-frontend-tors.txt            — zqz20-0101-0701-01t0,zqz20-0101-0701-02t0
   everflow-slb-frontend-filter.json         — 1 条（SrcVIP→SLBVIP）
```

> 上述每个 `*.json` filter 均可按需另存为 `*-compact.json`（紧凑单行）或 `*-lines.json`（每行一条 rule，推荐）两种排版，内容等价，详见 A.3。

`everflow-slb-backendVM-filter-mux24.json` 内容示例：

```json
[
  {"SrcIpPrefix":"10.60.0.0/24","DstIpPrefix":"10.50.1.12/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.60.0.0/24","DstIpPrefix":"10.37.195.18/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.60.0.0/24","DstIpPrefix":"10.50.1.25/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"40.162.93.144/32","DstIpPrefix":"1.2.3.4/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

`everflow-slb-frontend-filter.json` 内容：

```json
[
  {"SrcIpPrefix":"1.2.3.4/32","DstIpPrefix":"40.162.93.144/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

---

## 六、常见问题排查

| 现象 | 原因 | 处理 |
|------|------|------|
| Query #1 返回空 | ① VIP 直接绑定后端 VM 网卡（无 LB DIP 探测端点）② VIP 错误 ③ 时间窗口外 ④ 该 VIP 是 ILB 但查的是 SLB 集群 | **①→ 改跑 Query #1b（OutboundProbeResultHistoryEvent）取 ContainerId**；②确认 VIP 拼写；③扩大时间窗口；④ILB 也在同一表，确保 `Vip == ILBVIP` 精确匹配 |
| Query #1b 也返回空 | VIP 不由 SLB 承载 / 时间窗口外 / VIP 拼写错误 | 扩大时间窗口 `ago(7d)`；确认 VIP；确认是否为纯 Instance-Level Public IP（不经 Mux，无需 SLB 抓包） |
| Query #3 `RingNames` 为空 | VIP 不在 `VipRangesSnapshotEvent` 当前快照中（区域错配或 VIP 尚未上线） | 改用 `env_time > ago(7d)` 扩大窗口；确认 `env_cloud_location` 过滤是否过严 |
| Mux 数量远大于预期（>20） | 该 VIP 命中了多个 Ring，且每个 Ring 有大量实例 | 这是正常的；如要收敛，可只取 Active Ring，按 `tenantName` 过滤 |
| 后端 VM `NodeIp` 与 Query #2 的 `AddressesV4` 不一致 | 期间发生过 Live Migration / Service Healing | 以**最新一条**为准（Query #2 已用 `arg_max(TIMESTAMP, *)`），并在 filter 中同时保留新旧两个 PA 作为兜底 |
| 给的是 LB resource ID，但没法直接跑 Query #1 | 缺 VIP 字面量 | 先用 ARG 把 resource ID 解析成 frontend public IP（见"一、输入解析"末尾的 ARG 查询） |
| ILB 场景（内部 LB） | 客户端是 VNet 内 VM 而非公网 IP | `srcPublicIp` 改为客户端 VM 的 CA 或其宿主机 PA；其余流程一致 |

---

## 七、Skill 调用示例（自然语言触发）

> "帮我做 SLB 的 everflow 抓包准备，客户端 IP 是 `1.2.3.4`，SLB VIP 是 `40.162.93.144`，时间范围最近 2 天"

> "VIP `40.162.93.144` 的所有后端 VM 和 Mux 的 TOR 是什么？给我 Everflow filter"

> "这个 SLB `/subscriptions/.../loadBalancers/myLB` 我要抓客户端 `8.8.8.8` 过来的包，准备一下 filter"

---

## 相关 Skills

- [`everflow-vm-to-vm.md`](./everflow-vm-to-vm.md) — VM 到 VM 直连场景的 Everflow 抓包准备
