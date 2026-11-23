---
name: everflow-ilb
description: ILB（Internal Load Balancer）场景下，准备 Everflow 抓包配置。输入 LB resource ID + 客户端 VM 的 NodeIp（或客户端 VM resource ID），自动识别 ELB/ILB 类型，解析 LoadBalancerArmId 与 VipOrIlbPA，再走标准的 SLB 后端 / Mux 链路查询，输出**三组**文件：(A) 后端 VM 侧（everflow-ilb-backendVM-*）：TOR 列表 + 3 份 filter（Mux PA 按 /32、/24、/16 聚合，含双向 Fast Path 直连规则 SrcVMNodeIp ↔ BackendNodeIp）；(B) Mux 前端侧（everflow-ilb-frontend-*）：Mux TOR 列表 + 1 条入向 filter（SrcVMNodeIp → ILB VipAddress）；(C) 源 VM 侧（everflow-ilb-srcVM-*）：源 VM TOR 列表 + 1 份 filter（含 1 条出向首包 + 2M 条 Fast Path 双向规则）。触发词：everflow ILB、ILB 抓包、内部 LB 抓包、ILB VIP 抓包、ILB Fast Path 抓包
tables:
  - cluster('argmcn2nrpone.chinanorth2').database('AzureResourceGraph').Resources
  - cluster('azslbmc').database('azslbmdsmc').VipHealthProbe
  - cluster('azslbmc').database('azslbmdsmc').DipEndpointProbeHistoryEvent
  - cluster('azslbmc').database('azslbmdsmc').VipRangesSnapshotEvent
  - cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceStatic
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceIpInterface
parameters:
  - name: lbResourceId
    required: true
    description: Load Balancer resource ID，形如 `/subscriptions/<subId>/resourceGroups/<rg>/providers/Microsoft.Network/loadBalancers/<lbName>`。Skill 会自动识别 ELB / ILB；只有 ILB 场景才会走 VipOrIlbPA 解析分支
  - name: srcClientIpOrVmResourceId
    required: true
    description: 客户端源 VM 的 **NodeIp（宿主机 V4 PA）** 或该 VM 的 resource ID。任选一种形式：(1) NodeIp 字面量（**必须是宿主机 PA，不是 VM 内部 CA**），直接当 SrcVMNodeIp 使用；(2) VM resource ID `/subscriptions/.../virtualMachines/<vmName>`，skill 会自动查询该 VM 的 NodeIp（推荐方式）。⚠️ 因为 ILB Fast Path 后续报文走宿主机 PA 直连，filter 中需要的就是 NodeIp，**CA 不能用**
  - name: startTime
    required: false
    description: 查询开始时间（UTC，ISO 8601）。默认 endTime - 2d
  - name: endTime
    required: false
    description: 查询结束时间（UTC，ISO 8601）。默认 now()
---

# ILB 场景 Everflow 抓包准备

排查 ILB（Internal Load Balancer）入流量问题（如 VNet 内 VM 访问 ILB VIP 失败、健康探测异常、连接超时）时，需要同时在 **Mux 节点 TOR**（前端侧）和 **后端 VM 宿主机 TOR**（后端侧）抓包，才能完整还原一次会话的两段路径：

```
[首次报文 — 经 Mux 路径]
Client VM Host(SrcVMNodeIp) ──封装──▶ Mux(PA) ──封装──▶ Backend VM Host(NodeIp) ──▶ Backend VM

[后续报文 — ILB Fast Path，绕过 Mux，宿主机 PA 直连]
Client VM Host(SrcVMNodeIp) ◀──────── 直连 ────────▶ Backend VM Host(NodeIp)
```

> 💡 与 SLB（公网 ELB）的核心差异：
> - **输入只接受 LB resource ID**（ILB 私有 VIP 在 ARG 不直接可见，需要先反查 NRP 资源）
> - **多两步前置查询**：(0a) ARG 判断 ELB/ILB 并拿 `LoadBalancerArmId`；(0b) `VipHealthProbe` 拿 `VipAddress` + `VipOrIlbPA`
> - **`DipEndpointProbeHistoryEvent.Vip` 字段存的是 `VipOrIlbPA`**（SLB 内部 PA 映射），不是 ILB VipAddress 本身。所以 Query #1 / #3 的输入要用 `VipOrIlbPA`
> - **后端 VM 侧 filter 抓双向 Fast Path 流量**（SrcVMNodeIp ↔ BackendNodeIp 直连），不抓 SLB→Client 反向。这是 ILB 与 SLB filter 的**最大区别**：ILB 只有首包走 Mux，建链后 VFP 装载 Fast Path 流，后续全部直连，因此反向看到的不是 `ILBVipAddress` 而是 backend VM 的 `NodeIp`
> - **Mux 前端 filter 的 `SrcIpPrefix` 是 `SrcVMNodeIp`（NodeIp，不是 CA）**：因为客户端 VM 出向流量经 VFP 封装到 Mux 前端 TOR 时，外层 src 已经是 NodeIp

本 skill 自动到 `argmcn2nrpone` + `azslbmc` + `azurecm` + `aznwmds` 跨集群关联查询，输出**三组**抓包准备文件：

### A. 后端 VM 侧（文件前缀 `everflow-ilb-backendVM-`）

- **TOR 列表**：仅包含**后端 VM 所在 TOR**
- **3 份 Everflow filter JSON**：Mux PA 分别按 `/32`、`/24`、`/16` 聚合，方便按规则数量上限灵活选择
  - `/32`：精确 Mux PA × 后端 NodeIp（规则最多，最精确）
  - `/24`：Mux PA 同 C 段聚合（规则减少，可能引入少量噪声）
  - `/16`：Mux PA 同 B 段聚合（规则最少，噪声最大但通常足以覆盖整 Region 的 Mux）
- 每份 filter 末尾附加 **2 组 Fast Path 规则**（共 2M 条，M = 后端 VM 数）：
  - **Fast Path 正向**（M 条）：`SrcVMNodeIp/32 → BackendNodeIp_x/32`
  - **Fast Path 反向**（M 条）：`BackendNodeIp_x/32 → SrcVMNodeIp/32`
  - 这是 ILB 特有规则，覆盖建链后 VFP 装载 Fast Path 流的双向直连报文

### B. Mux 前端侧（文件前缀 `everflow-ilb-frontend-`）

- **TOR 列表**：仅包含**Mux 所在 TOR**
- **1 份 Everflow filter JSON**：**仅一条入向规则** `SrcVMNodeIp/32 → ILBVipAddress/32`
  - 原因：Mux 前端 T0 只能收集**入向**报文（客户端 VM 出向经封装到 Mux 前端的首包），且只在建链阶段（首包未走 Fast Path 之前）经过 Mux。后续 Fast Path 流不再经 Mux，由 A 组规则在后端 TOR 抓到。

### C. 源 VM 侧（文件前缀 `everflow-ilb-srcVM-`）

- **TOR 列表**：仅包含**源（客户端）VM 所在 TOR**（来自 Query #0c）
- **1 份 Everflow filter JSON**，共 `1 + 2M` 条规则：
  - **出向首包**（1 条）：`SrcVMNodeIp/32 → ILBVipAddress/32`（客户端 VM 经 VFP 封装后发往 Mux 的入向包，源 TOR 上也能抓到）
  - **Fast Path 正向**（M 条）：`SrcVMNodeIp/32 → BackendNodeIp_x/32`
  - **Fast Path 反向**（M 条）：`BackendNodeIp_x/32 → SrcVMNodeIp/32`
- 与 A 组的 Fast Path 部分**互为冗余**：理论上 Fast Path 流量在源 TOR 和后端 TOR 都能抓到。同时部署两端可作为兜底，对照分析也更直观。

---

## 一、输入解析

| 输入 | 含义 | 解析规则 |
|------|------|---------|
| **lbResourceId** | LB resource ID（ARM 路径） | 必填。先用 ARG（Query #0a）查 `type == "microsoft.network/loadbalancers"`，确认是 ELB 还是 ILB，并取 `resourceGuid` 作为 `LoadBalancerArmId` |
| **srcClientIpOrVmResourceId** | 客户端源 VM 的 **NodeIp（宿主机 PA）** 字面量 **或** 客户端 VM resource ID | 形如 IPv4/IPv6 字面量 → 直接当 `SrcVMNodeIp`（**必须是 NodeIp，不能是 CA**）；形如 `/subscriptions/.../virtualMachines/...` → 跑核心 VM 解析查询拿到该 VM 的 `AddressesV4` 作为 `SrcVMNodeIp`（详见下文 Query #0c，**强烈推荐用 resource ID 形式以避免误填 CA**） |
| **startTime / endTime** | 时间窗口 | 默认 endTime - 2d；ARG 查询会自动在 startTime 基础上再 - 1d 兜底 |

> ⚠️ **判断 ELB / ILB**：用 ARG `Resources` 表的 `frontendIPConfigurations[0].properties.publicIPAddress.id` 字段判定 ELB；用 `frontendIPConfigurations[0].properties.privateIPAddress` 判定 ILB。本 skill 主流程**假定输入是 ILB**，但 Query #0a 同时给出 `ELB` / `ILB` 标志位，如果识别到 ELB 应该转用 `everflow-slb.md` skill。
>
> ⚠️ **关键概念区分**：
> - `VipAddress`：ILB 的私有前端 VIP（如 `10.0.0.4`）—— 数据面首包中 dst = ILBVipAddress；**填到前端 filter 的 `DstIpPrefix`**（后端 VM 侧 filter 不再用 VipAddress，因为 Fast Path 后报文是 NodeIp 直连）
> - `VipOrIlbPA`：ILB 在 SLB 系统中分配的内部 PA —— 控制面 `DipEndpointProbeHistoryEvent.Vip` 字段实际存的值，**填到 Query #1 / #3 的 `SLBVIPorILBVIP` 变量**
> - `SrcVMNodeIp`：客户端 VM 所在宿主机的 V4 PA —— 后端 filter 的反向 dst（以及 Fast Path 正向 src）和前端 filter 的 src；**必须是 NodeIp，不是 VM 内部 CA**
> - `BackendNodeIp`：后端 VM 所在宿主机的 V4 PA —— 后端 filter 的正向 dst（以及 Fast Path 反向 src）；来自 Query #1 的 `NodeIp` 字段
>
> `VipAddress` 与 `VipOrIlbPA` 在 `VipHealthProbe` 表的同一行返回。

---

## 二、执行流程

```
Step 0a: Query #0a - ARG Resources
         以 lbResourceId 为条件，确认是 ELB 还是 ILB
         → 提取 LoadBalancerArmId (= resourceGuid)，校验 ILB=Yes

Step 0b: Query #0b - VipHealthProbe
         以 LoadBalancerArmId 为条件
         → 提取 VipAddress（ILB 私有 VIP）、VipOrIlbPA（SLB 内部 PA）

Step 0c: 解析 srcClientIpOrVmResourceId
         - 如果是 IP 字面量 → SrcVMNodeIp = 该字面量（必须是宿主机 PA，不是 CA）
         - 如果是 VM resource ID → 跑 LogContainerSnapshot + aznwmds 标准查询
           → SrcVMNodeIp = 该 VM 的 AddressesV4（宿主机 PA，推荐方式）

Step 1: Query #1 - DipEndpointProbeHistoryEvent
        以 SLBVIPorILBVIP = VipOrIlbPA 为条件
        → 提取每个后端 VM 的 ContainerId、NodeIp、PA、NodeId、Region 等

Step 2: Query #2 - LogContainerSnapshot ⋈ aznwmds.*
        对 Query #1 返回的所有 ContainerId 批量查询（in() 模式）
        → 提取每个后端 VM 的 TOR、ServerName、AddressesV4

Step 3: Query #3 - VipRangesSnapshotEvent → LogContainerSnapshot ⋈ aznwmds.*
        以 SLBVIPorILBVIP = VipOrIlbPA 命中的 RingName 反查所有 Mux 容器
        → 提取每个 Mux 实例的 AddressesV4 (= Mux PA) 和 TOR

Step 4: 聚合 Mux PA
        - /32 集合：Q#3 全部 AddressesV4，保留原样
        - /24 集合：每个 PA 的前 3 段 + ".0/24"，去重
        - /16 集合：每个 PA 的前 2 段 + ".0.0/16"，去重

Step 5: 组装三组输出
   A. 后端 VM 侧（everflow-ilb-backendVM-*）
      - TOR 列表 = unique(后端 TOR)，逗号分隔
      - Everflow Filter 共 3 份（mux32/mux24/mux16），每份含 3 组规则：
          · Mux 入向首包（N×M 条）：所有 Mux PA（按 /32 或 /24 或 /16）× 所有后端 NodeIp 的笛卡尔积
          · Fast Path 正向（M 条）：SrcVMNodeIp/32 → 每个后端 NodeIp/32
          · Fast Path 反向（M 条）：每个后端 NodeIp/32 → SrcVMNodeIp/32
        共计 N×M + 2M 条
   B. Mux 前端侧（everflow-ilb-frontend-*）
      - TOR 列表 = unique(Mux TOR)，逗号分隔
      - Everflow Filter 1 份，仅 1 条入向规则：
          · SrcIpPrefix = SrcVMNodeIp/32，DstIpPrefix = ILBVipAddress/32
   C. 源 VM 侧（everflow-ilb-srcVM-*）
      - TOR 列表 = unique(源 VM TOR)，逗号分隔（通常 1 个）
      - Everflow Filter 1 份，含 1 + 2M 条规则：
          · 出向首包（1 条）：SrcVMNodeIp/32 → ILBVipAddress/32
          · Fast Path 正向（M 条）：SrcVMNodeIp/32 → 每个后端 NodeIp/32
          · Fast Path 反向（M 条）：每个后端 NodeIp/32 → SrcVMNodeIp/32
```

> Query #0a 必须最先跑（拿 LoadBalancerArmId）；
> Query #0b、#0c 可以并行；
> Query #1 必须在 #0b 之后跑（依赖 VipOrIlbPA）；
> Query #2 依赖 Query #1 的 ContainerId 列表；
> Query #3 与 Query #1 / #2 并行（只依赖 VipOrIlbPA）。

---

## 三、核心查询模板

### Query #0a — 判断 ELB / ILB，并拿 LoadBalancerArmId

```kql
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
let subid = '{subscriptionId}';   // 从 lbResourceId 中解析出来的 subId
let SubscriptionID = subid;
let starttime = _startTime;
let endtime   = _endTime;
let startunixtime = tolong(starttime - datetime(1970-01-01)) / 10000;
let endunixtime   = tolong(endtime   - datetime(1970-01-01)) / 10000;
cluster('argmcn2nrpone.chinanorth2').database('AzureResourceGraph').Resources
| where subscriptionId == SubscriptionID
| where timestamp >= starttime - 1d and timestamp <= endtime
| where type == "microsoft.network/loadbalancers"
| where id =~ '{lbResourceId}'
| distinct id,
           SKU = tostring(sku["name"]),
           Tier = tostring(sku["tier"]),
           location,
           ELB = tostring(parse_json(properties)["frontendIPConfigurations"][0]["properties"]["publicIPAddress"]["id"]),
           ILB = tostring(parse_json(properties)["frontendIPConfigurations"][0]["properties"]["privateIPAddress"]),
           LoadBalancerArmId = tostring(properties["resourceGuid"])
| extend ELB = case(isnotempty(ELB), "Yes", "No")
| extend ILB = case(isnotempty(ILB), "Yes", "No")
| distinct ResourceID = id, LoadBalancerArmId, SKU, Tier, location, ELB, ILB
```

**字段提取**：

| 输出列 | 用途 |
|--------|------|
| `LoadBalancerArmId` | 喂给 Query #0b 找 VipOrIlbPA |
| `ELB` / `ILB` | 校验输入 LB 是 ILB；如果 `ELB == Yes`，请改用 [`everflow-slb.md`](./everflow-slb.md) |
| `location` | 区域信息，辅助排查 |

> ⚠️ **`LoadBalancerArmId` 实际是 `properties.resourceGuid` 字段**，不是 ARM ID。这是 SLB 控制面对 LB 的内部 GUID 引用。

---

### Query #0b — 用 LoadBalancerArmId 查 ILB 的 VipAddress 与 VipOrIlbPA

```kql
let LoadBalancerArmId = '{loadBalancerArmId}';     // 来自 Query #0a 的 resourceGuid
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
let LoadBalancerArmID = LoadBalancerArmId;
let starttime = _startTime;
let endtime   = _endTime;
let startunixtime = tolong(starttime - datetime(1970-01-01)) / 10000;
let endunixtime   = tolong(endtime   - datetime(1970-01-01)) / 10000;
let LBArmId = LoadBalancerArmID;
cluster('azslbmc').database('azslbmdsmc').VipHealthProbe
| where env_time > starttime - 1h and env_time <= endtime
| where LoadBalancerArmId =~ LBArmId
| distinct VipAddress, VipOrIlbPA, Region, LoadBalancerArmId
```

**字段提取**：

| 输出列 | 用途 |
|--------|------|
| `VipAddress` | ILB 的私有前端 VIP（如 `10.0.0.4`）→ **填到 filter 反向规则的 `SrcIpPrefix`，以及前端 filter 的 `DstIpPrefix`** |
| `VipOrIlbPA` | ILB 在 SLB 系统的内部 PA → **作为 `SLBVIPorILBVIP` 变量喂给 Query #1 和 Query #3** |
| `Region` | 区域信息，可与 Query #0a 的 `location` 交叉校验 |

> 💡 **为什么是 `env_time > starttime - 1h`** ：`VipHealthProbe` 是高频快照表，把开始时间往前推 1h 可避免在窗口起点恰好无快照点的边界情况。

---

### Query #0c — （仅当输入是 VM resource ID 时）解析客户端 VM 的 NodeIp 与 TOR

> 仅在 `srcClientIpOrVmResourceId` 是 VM resource ID 形式时执行。IP 字面量直接跳过（此时源 TOR 信息不可得，C 组只能由用户手动指定 TOR）。

```kql
let ContId = '';
let Name   = '{srcClientVmName}';        // 从 srcClientIpOrVmResourceId 解析的 VM 名
let subid  = '{srcClientSubscriptionId}'; // 从 srcClientIpOrVmResourceId 解析的 subId
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
let starttime = _startTime;
let endtime   = _endTime;
let subscriptionid   = subid;
let roleInstanceName = Name;
cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
| where PreciseTimeStamp >= starttime and PreciseTimeStamp <= endtime
| where ((isnotempty(subscriptionId) and subscriptionId =~ subscriptionid and isnotempty(roleInstanceName) and roleInstanceName contains Name))
     or (isnotempty(containerId) and containerId == ContId)
| summarize arg_max(TIMESTAMP, *) by roleInstanceName, nodeId
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers
        | extend nodeId = tolower(NodeId))
        on $left.nodeId == $right.nodeId
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks
        | project StartDevice, StartPort, EndDevice, EndPort)
        on $left.DeviceName == $right.StartDevice
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface
        | where isnotempty(AddressesV4)
        | where InterfaceName =~ 'HostIP')
        on DeviceName
| project roleInstanceName, nodeId, containerId, ServerName=StartDevice, TOR=EndDevice, AddressesV4
```

**字段提取**：

| 输出列 | 用途 |
|--------|------|
| `AddressesV4` | 客户端 VM 的宿主机 V4 PA → 作为 `SrcVMNodeIp` 填到所有 filter |
| `TOR` | 客户端 VM 所在的 T0 设备 → **C 组 srcVM-tors 列表** |

> ⚠️ **不能用 CA 代替 NodeIp**：filter 中的 `SrcVMNodeIp` 是客户端 VM 所在**宿主机的 V4 PA**，不是 VM 内部 CA。Fast Path 后报文在物理网络上的 src/dst 是宿主机 PA（NodeIp），CA 只出现在 overlay 解封装后的包头里，在 TOR 抓不到。如果只知道客户端 VM 名/CA，**务必走 VM resource ID 路径让 Query #0c 自动解析**。
>
> ℹ️ 如果只传了 IP 字面量（NodeIp）而非 VM resource ID，Query #0c 会被跳过，**C 组的 TOR 列表无法自动生成**，需要用户根据 NodeIp 自己确定所在的 T0 TOR（可单独跑一个 `DeviceIpInterface | where AddressesV4 has 'x.x.x.x'` 反查）。

---

### Query #1 — 找出 ILB VIP 所有后端 DIP（VM）

> **输入为 VipOrIlbPA**，不是 ILB VipAddress。这是 ILB 场景与 SLB 场景的核心区别。

```kql
let SLBVIPorILBVIP = '{vipOrIlbPA}';   // 来自 Query #0b 的 VipOrIlbPA
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
| `ProbeStatus` | 健康探测状态（Up / Down） |
| `Vip` | 反查时其值应等于 `VipOrIlbPA`（不是 ILB VipAddress） |

---

### Query #2 — 后端 VM 的 TOR 信息（按 ContainerId 批量）

> 与 `everflow-slb.md` Query #2 完全一致。

```kql
let ContIds = dynamic([{containerIdList}]);
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

---

### Query #3 — Mux 实例的 PA 与 TOR

> 与 `everflow-slb.md` Query #3 完全一致；输入 `SLBVIPorILBVIP` 仍然填 `VipOrIlbPA`。

```kql
let SLBVIPorILBVIP = '{vipOrIlbPA}';
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
| `TOR` | Mux 端的 TOR 设备，加入 B 组 TOR 列表 |
| `tenantName` | Ring 名称 |

> 💡 ILB 场景下 Mux 数量通常与 SLB 同 region 类似（每 Ring N 实例，VIP 命中 1~3 个 Ring）。

---

## 四、输出格式

### A. 后端 VM 侧（文件前缀 `everflow-ilb-backendVM-`）

#### A.1 TOR 列表 — `everflow-ilb-backendVM-tors.txt`

```
{TOR_backend_1},{TOR_backend_2},...,{TOR_backend_M}
```

- 取 Query #2 的所有 `TOR`，去重后逗号分隔（不带空格）
- **不包含** Mux TOR（Mux 侧抓包参见 B 组）

#### A.2 Everflow Filter（3 份 JSON，按 Mux PA 聚合粒度区分）

每份 JSON 包含 **3 组规则**：

```json
[
  // 1) Mux 入向首包（N × M 条）：所有 Mux PA × 所有后端 NodeIp 的笛卡尔积
  {"SrcIpPrefix":"{MuxPA_aggregated}","DstIpPrefix":"{BackendNodeIp_x}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  ...

  // 2) Fast Path 正向（M 条）：源 VM NodeIp → 每个后端 NodeIp
  {"SrcIpPrefix":"{SrcVMNodeIp}/32","DstIpPrefix":"{BackendNodeIp_x}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  ...

  // 3) Fast Path 反向（M 条）：每个后端 NodeIp → 源 VM NodeIp
  {"SrcIpPrefix":"{BackendNodeIp_x}/32","DstIpPrefix":"{SrcVMNodeIp}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

三种聚合粒度（只影响第 1 组规则，第 2/3 组 Fast Path 规则数不变）：

| 文件 | Mux PA 形式 | 聚合方式 | 规则数 | 适用场景 |
|------|------------|----------|-------|---------|
| `everflow-ilb-backendVM-filter-mux32.json` | `a.b.c.d/32` | Q#3 原始 PA 逐个保留 | **N × M + 2M** | 默认；规则数在抓包系统上限内时首选 |
| `everflow-ilb-backendVM-filter-mux24.json` | `a.b.c.0/24` | 每个 PA 取前 3 段 + `.0/24`，去重 | **N_24 × M + 2M** | 规则超限或想适度合并 Mux |
| `everflow-ilb-backendVM-filter-mux16.json` | `a.b.0.0/16` | 每个 PA 取前 2 段 + `.0.0/16`，去重 | **N_16 × M + 2M** | 规则数极度受限；通常 N_16 ≤ 3，最简洁 |

> N = Mux PA 个数（/32），N_24 / N_16 = 按 /24、/16 去重后的子网数，M = 后端 VM 数。

字段映射（**与 SLB 的关键差异**用粗体标出）：

| 规则组 | Filter 字段 | 来源 | 说明 |
|--------|------------|------|------|
| 1) Mux 入向 | `SrcIpPrefix` | Query #3 `AddressesV4` 经 /32 ∥ /24 ∥ /16 聚合 | Mux 宿主机 PA |
| 1) Mux 入向 | `DstIpPrefix` | Query #1 `NodeIp` + `/32` | 后端 VM 宿主机 PA |
| 2) FP 正向 | `SrcIpPrefix` | `SrcVMNodeIp` + `/32` | **客户端 VM 宿主机 PA（NodeIp）** |
| 2) FP 正向 | `DstIpPrefix` | Query #1 `NodeIp` + `/32` | 后端 VM 宿主机 PA |
| 3) FP 反向 | `SrcIpPrefix` | Query #1 `NodeIp` + `/32` | 后端 VM 宿主机 PA |
| 3) FP 反向 | `DstIpPrefix` | `SrcVMNodeIp` + `/32` | **客户端 VM 宿主机 PA（NodeIp）** |
| 所有 | `SrcPort` / `DstPort` / `Protocol` / `TcpFlags` / `Dscp` | 固定 0 | 抓所有协议端口 |

> ✅ **为什么 ILB 后端 filter 没有 VipAddress 相关规则？**
> ILB 走 **Fast Path** 机制：客户端 VM 与后端 VM 建链时首包经 Mux（→ 第 1 组规则覆盖），但 VFP 一旦装载 Fast Path 流之后，**后续所有报文绕过 Mux**，直接在客户端宿主机和后端宿主机之间用各自的 NodeIp 直连（→ 第 2/3 组规则覆盖）。从后端 TOR 看，无论入向出向，5-tuple 都是 `NodeIp ↔ NodeIp`，`VipAddress` 不再出现。
>
> ✅ **为什么 Mux 入向是笛卡尔积？**
> 与 SLB 一致：5-tuple hash 不可预测命中哪个 Mux 和哪个后端，N×M 全配对才能保证抓到首包。
>
> ✅ **为什么 Fast Path 规则要双向？**
> 后端 TOR 是后端 VM 流量的必经路径，正向（客户端→后端）和反向（后端→客户端）都会经过同一 TOR；两条方向的 5-tuple 不同，需要单独写规则。

---

### B. Mux 前端侧（文件前缀 `everflow-ilb-frontend-`）

#### B.1 TOR 列表 — `everflow-ilb-frontend-tors.txt`

```
{TOR_mux_1},{TOR_mux_2},...,{TOR_mux_K}
```

- 取 Query #3 的所有 `TOR`，去重后逗号分隔（不带空格）

#### B.2 Everflow Filter — `everflow-ilb-frontend-filter.json`

**只有一条入向规则**：

```json
[
  {"SrcIpPrefix":"{SrcVMNodeIp}/32","DstIpPrefix":"{ILBVipAddress}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

字段映射：

| Filter 字段 | 来源 | 说明 |
|------------|------|------|
| `SrcIpPrefix` | `SrcVMNodeIp` + `/32` | **客户端 VM 宿主机 PA（NodeIp）**，来自用户输入或 Query #0c |
| `DstIpPrefix` | `VipAddress`（来自 Query #0b）+ `/32` | **ILB 私有前端 VIP（不是 VipOrIlbPA）** |
| 其余字段 | 固定 0 | 抓所有协议端口 |

> ✅ **为什么 SrcIpPrefix 用 NodeIp 不用 CA？**
> 客户端 VM 出向流量经 VFP **封装后**才到达物理网络。Mux 前端 TOR 上抓到的就是封装后的外层 IP：**外层 src = 客户端宿主机 NodeIp**，**外层 dst = ILB VipAddress**。VM 内部 CA 只在解封装后的 inner header 里出现，TOR 不可见。
>
> ✅ **为什么只有一条规则？**
> Mux 前端 T0 只负责首包（建链阶段未走 Fast Path）。后续 Fast Path 流绕过 Mux，由 A 组规则在后端 TOR 抓到。所以前端只需 1 条入向。

---

### C. 源 VM 侧（文件前缀 `everflow-ilb-srcVM-`）

#### C.1 TOR 列表 — `everflow-ilb-srcVM-tors.txt`

```
{TOR_srcVM_1},...
```

- 取 Query #0c 输出的 `TOR`，去重后逗号分隔（通常只有 1 个 TOR）
- 如果输入是 IP 字面量（跳过了 Query #0c），需要用户手动指定该 NodeIp 所在 T0 TOR

#### C.2 Everflow Filter — `everflow-ilb-srcVM-filter.json`

共 `1 + 2M` 条规则：

```json
[
  // 1) 出向首包（1 条）：客户端 VM → ILB VIP，封装后从源宿主机出
  {"SrcIpPrefix":"{SrcVMNodeIp}/32","DstIpPrefix":"{ILBVipAddress}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},

  // 2) Fast Path 正向（M 条）：源 VM NodeIp → 每个后端 NodeIp
  {"SrcIpPrefix":"{SrcVMNodeIp}/32","DstIpPrefix":"{BackendNodeIp_x}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  ...

  // 3) Fast Path 反向（M 条）：每个后端 NodeIp → 源 VM NodeIp
  {"SrcIpPrefix":"{BackendNodeIp_x}/32","DstIpPrefix":"{SrcVMNodeIp}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

字段映射：

| 规则组 | Filter 字段 | 来源 | 说明 |
|--------|------------|------|------|
| 1) 出向首包 | `SrcIpPrefix` | `SrcVMNodeIp` + `/32` | 源 VM 宿主机 PA |
| 1) 出向首包 | `DstIpPrefix` | `VipAddress`（来自 Query #0b）+ `/32` | ILB 私有前端 VIP（数据面外层 dst） |
| 2) FP 正向 | `SrcIpPrefix` | `SrcVMNodeIp` + `/32` | 源 VM 宿主机 PA |
| 2) FP 正向 | `DstIpPrefix` | Query #1 `NodeIp` + `/32` | 后端 VM 宿主机 PA |
| 3) FP 反向 | `SrcIpPrefix` | Query #1 `NodeIp` + `/32` | 后端 VM 宿主机 PA |
| 3) FP 反向 | `DstIpPrefix` | `SrcVMNodeIp` + `/32` | 源 VM 宿主机 PA |
| 所有 | `SrcPort` / `DstPort` / `Protocol` / `TcpFlags` / `Dscp` | 固定 0 | 抓所有协议端口 |

> ✅ **C 组与 A 组、B 组的关系**：
> - **C 组的第 1 组（出向首包）** 与 B 组那 1 条规则**完全相同**，但部署位置不同：B 组在 Mux 前端 TOR 抓（包到达 Mux 侧），C 组在源 VM TOR 抓（包从客户端宿主机出去）—— 两端互为冗余，可校验数据路径完整性
> - **C 组的第 2/3 组（Fast Path 双向）** 与 A 组同名规则相同，部署位置同样是另一端冗余：A 组在后端 TOR 抓，C 组在源 TOR 抓
> - **C 组不包含 Mux→Backend 笛卡尔积**：Mux→后端的封装流量不经过源 VM 所在 TOR
>
> 💡 **优先级建议**：抓包资源紧张时，最小集合是 A 组 + B 组（已能覆盖完整数据路径）；C 组作为对侧冗余，适合疑难场景（如怀疑源 VM 宿主机 VFP/网卡异常）时启用。

---

## 五、端到端示例

**输入**：

- `lbResourceId` = `/subscriptions/ea58df11-3f3e-4efc-8adc-2f27b4092480/resourceGroups/POTRRMCNINFRESGP004/providers/Microsoft.Network/loadBalancers/POTRRCNINFINTLB002`
- `srcClientIpOrVmResourceId` = `/subscriptions/ea58df11-3f3e-4efc-8adc-2f27b4092480/resourceGroups/myClientRg/providers/Microsoft.Compute/virtualMachines/myClientVM01`（VM resource ID，由 Query #0c 解析 NodeIp）
- 时间范围：`2026-05-19T06:14:58Z ~ 2026-05-21T06:14:58Z`

**Query #0a 结果**：

| ResourceID | LoadBalancerArmId | SKU | Tier | ELB | ILB |
|-----------|-------------------|-----|------|-----|-----|
| `/subscriptions/.../POTRRCNINFINTLB002` | `bbab17c5-a369-463a-b106-fba09db08a6e` | Standard | Regional | No | **Yes** |

**Query #0b 结果**：

| VipAddress | VipOrIlbPA | Region |
|-----------|-----------|--------|
| `10.0.0.4` | `40.162.90.240` | chinanorth2 |

> ⚠️ 注意：`VipOrIlbPA` 这里恰好长得像个公网地址（`40.x.x.x`）—— 这是 SLB 内部 PA 池，**不是真的公网可达**。它只在 SLB 控制面/数据面内部使用。

**Query #0c 结果**（客户端 VM NodeIp + TOR 解析）：

| roleInstanceName | nodeId | TOR | AddressesV4 |
|------------------|--------|-----|-------------|
| `myClientVM01` | `aaaa...` | `zqz20-0101-0610-08t0` | `10.50.1.99` |

**解析后的关键参数**：

| 参数 | 值 | 用途 |
|------|-----|------|
| `SLBVIPorILBVIP`（喂给 Q#1、Q#3） | `40.162.90.240` (= `VipOrIlbPA`) | 控制面查询 |
| `ILBVipAddress`（填到前端/源 VM filter dst） | `10.0.0.4` (= `VipAddress`) | 数据面 packet 头 |
| `SrcVMNodeIp`（填到所有 filter） | `10.50.1.99` (= Q#0c `AddressesV4`) | 客户端 VM 宿主机 PA |
| `SrcVMTOR`（C 组 TOR 列表） | `zqz20-0101-0610-08t0` (= Q#0c `TOR`) | 源 VM 所在 T0 |

**Query #1 结果**（假设 3 个后端 VM）：

| ContainerId | NodeIp | DipCA | ProbeStatus |
|-------------|--------|-------|-------------|
| `f3ba360e-...` | `10.50.1.12` | `10.0.0.10` | Up |
| `792baad3-...` | `10.37.195.18` | `10.0.0.11` | Up |
| `aabbccdd-...` | `10.50.1.25` | `10.0.0.12` | Up |

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

**最终输出（三组共 8 个文件）**：

```
A. 后端 VM 侧:
   everflow-ilb-backendVM-tors.txt           — zqz20-0101-0609-10t0,zqz22-0101-0606-14t0,zqz20-0101-0609-12t0
   everflow-ilb-backendVM-filter-mux32.json  — 2 × 3 + 2 × 3 = 12 条
   everflow-ilb-backendVM-filter-mux24.json  — 1 × 3 + 2 × 3 = 9 条
   everflow-ilb-backendVM-filter-mux16.json  — 1 × 3 + 2 × 3 = 9 条

B. Mux 前端侧:
   everflow-ilb-frontend-tors.txt            — zqz20-0101-0701-01t0,zqz20-0101-0701-02t0
   everflow-ilb-frontend-filter.json         — 1 条（SrcVMNodeIp → ILBVipAddress）

C. 源 VM 侧:
   everflow-ilb-srcVM-tors.txt               — zqz20-0101-0610-08t0
   everflow-ilb-srcVM-filter.json            — 1 + 2 × 3 = 7 条
```

`everflow-ilb-backendVM-filter-mux24.json` 内容（9 条 = Mux→Backend 3 + FP 正向 3 + FP 反向 3）：

```json
[
  {"SrcIpPrefix":"10.60.0.0/24","DstIpPrefix":"10.50.1.12/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.60.0.0/24","DstIpPrefix":"10.37.195.18/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.60.0.0/24","DstIpPrefix":"10.50.1.25/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},

  {"SrcIpPrefix":"10.50.1.99/32","DstIpPrefix":"10.50.1.12/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.50.1.99/32","DstIpPrefix":"10.37.195.18/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.50.1.99/32","DstIpPrefix":"10.50.1.25/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},

  {"SrcIpPrefix":"10.50.1.12/32","DstIpPrefix":"10.50.1.99/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.37.195.18/32","DstIpPrefix":"10.50.1.99/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.50.1.25/32","DstIpPrefix":"10.50.1.99/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

`everflow-ilb-frontend-filter.json` 内容：

```json
[
  {"SrcIpPrefix":"10.50.1.99/32","DstIpPrefix":"10.0.0.4/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

`everflow-ilb-srcVM-filter.json` 内容（7 条 = 出向首包 1 + FP 正向 3 + FP 反向 3）：

```json
[
  {"SrcIpPrefix":"10.50.1.99/32","DstIpPrefix":"10.0.0.4/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},

  {"SrcIpPrefix":"10.50.1.99/32","DstIpPrefix":"10.50.1.12/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.50.1.99/32","DstIpPrefix":"10.37.195.18/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.50.1.99/32","DstIpPrefix":"10.50.1.25/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},

  {"SrcIpPrefix":"10.50.1.12/32","DstIpPrefix":"10.50.1.99/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.37.195.18/32","DstIpPrefix":"10.50.1.99/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.50.1.25/32","DstIpPrefix":"10.50.1.99/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

---

## 六、常见问题排查

| 现象 | 原因 | 处理 |
|------|------|------|
| Query #0a 返回 `ELB=Yes, ILB=No` | 输入的其实是公网 LB | 转用 [`everflow-slb.md`](./everflow-slb.md) skill |
| Query #0a 返回空 | LB resource ID 拼写错误 / subscriptionId 错配 / 时间窗口外 | 仔细核对 `id =~` 大小写不敏感；`subscriptionId == SubscriptionID` 必须精确匹配；可扩 `timestamp >= starttime - 7d` |
| Query #0b 返回空 | LoadBalancerArmId（即 resourceGuid）在 `VipHealthProbe` 表没有记录 / 该 LB 刚创建未上报 | 扩大 `env_time` 窗口；确认该 ILB 的健康探测确实在工作 |
| Query #0b 返回多行（不同 VipAddress） | LB 配置了多个 frontendIPConfigurations | 选择目标 VIP 对应的那行；或全部都跑一遍 Query #1 |
| Query #1 返回空 | 喂的是 `VipAddress` 而不是 `VipOrIlbPA` | **关键陷阱**：`DipEndpointProbeHistoryEvent.Vip` 字段存的是 `VipOrIlbPA`，不是私有 VIP 字面量 |
| Query #3 `RingNames` 为空 | `VipOrIlbPA` 不在 `VipRangesSnapshotEvent` 当前快照中 | 改用 `env_time > ago(7d)` 扩大窗口；确认 `env_cloud_location` 过滤是否过严 |
| 后端 NodeIp 与 Query #2 的 AddressesV4 不一致 | 期间发生过 Live Migration / Service Healing | 以最新一条为准（已用 `arg_max`），filter 可同时保留新旧两个 PA 作为兜底 |
| 客户端是 VM resource ID 但 Query #0c 报错 | `subscriptionId =~` 分支两端都需要非空 | 如果只用 containerId 形式输入客户端 VM，把 `subid` / `Name` 都填 `''` |
| `SrcVMNodeIp` 填成 CA | 误把 VM 内部 IP 当 NodeIp | filter 中的 `SrcVMNodeIp` 必须是**宿主机 V4 PA**（NodeIp），不是 VM 内部 CA。Fast Path 后报文在物理网络上的 src/dst 全是 NodeIp。如果只知道客户端 VM 名，**用 VM resource ID 形式让 Query #0c 自动解析**；如果只有 CA，需要先额外查一次该 VM 的宿主机 PA |
| 后端 TOR 抓不到 Fast Path 流量 | 抓包时刻还在首包建链阶段 / Fast Path 未生效 | 第 1 组 Mux→Backend 规则会兜底；继续保留所有 3 组规则即可，不需要去掉哪一组 |
| 规则数过多（N×M + 2M）超过抓包系统上限 | M 或 N 太大 | 优先切换到 `mux24` / `mux16` 文件减少第 1 组；Fast Path 规则数（2M）无法压缩，因为不能聚合 NodeIp |

---

## 七、Skill 调用示例（自然语言触发）

> "帮我做 ILB 的 everflow 抓包准备，LB `/subscriptions/.../loadBalancers/POTRRCNINFINTLB002`，客户端 IP `10.0.1.10`"

> "这个 ILB `/subscriptions/.../INTLB002` 我要抓客户端 VM `/subscriptions/.../virtualMachines/myClient01` 过来的包，准备一下 filter"

> "ILB resource id 是 xxx，源 VM CA 是 10.0.1.10，时间范围最近 2 天，给我 TOR 和 Everflow filter"

---

## 相关 Skills

- [`everflow-slb.md`](./everflow-slb.md) — SLB（公网 ELB）场景，输入 `srcPublicIp` + `slbVipOrResourceId`，输出与本 skill 对称的 6 个文件
- [`everflow-vm-to-vm.md`](./everflow-vm-to-vm.md) — VM 到 VM 直连场景，本 skill 的 Query #0c 复用其核心 VM 解析查询
