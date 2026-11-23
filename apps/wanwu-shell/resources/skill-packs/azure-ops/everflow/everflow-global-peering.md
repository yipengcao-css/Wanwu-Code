---
name: everflow-global-peering
description: Global VNet Peering（跨区域对等互连）场景下，准备 Everflow 抓包配置。输入源/目标 VM（支持完整 VM resource ID、subId+VM Name 或 containerId 三种形式），自动查询两端 VM 的 ContainerId、TOR、以及关键的 VA_PRIMARY_PA_V6（IPv6 PA），最终输出两端 TOR 设备列表 + 双向 Everflow filter（基于 IPv6 /128 PA）。⚠️ 与 vm-to-vm 的核心区别：Global peering 跨区域流量走微软骨干网、用 IPv6 underlay，filter 必须用 VA_PRIMARY_PA_V6（/128），而不是 V4 PA。触发词：everflow global peering、Global peering 抓包、跨区域 peering 抓包、全局对等互连抓包、IPv6 PA 抓包、跨 region VM 抓包
tables:
  - cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
  - cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogNodeSnapshot
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceStatic
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceIpInterface
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').InterfaceAliasProgrammedFiveMinuteTable
parameters:
  - name: srcVmInput
    required: true
    description: 源 VM 信息。任选一种格式：(1) 完整 VM resource ID；(2) subId + VM Name 组合；(3) containerId（GUID）
  - name: dstVmInput
    required: true
    description: 目标 VM 信息。格式同 srcVmInput
  - name: startTime
    required: false
    description: 查询开始时间（UTC，ISO 8601）。默认 endTime - 2d
  - name: endTime
    required: false
    description: 查询结束时间（UTC，ISO 8601）。默认 now()
---

# Global Peering 场景 Everflow 抓包准备

排查 **Global VNet Peering（跨区域对等互连）** 的 VM 到 VM 流量问题（如跨 region 不通、延迟高、丢包）时，需要在**两端 VM 所在 TOR** 上同时抓包。

## 一、数据平面（为什么用 IPv6 PA）

> 🚨 **核心区别**：普通同区域 VM-to-VM 走 **IPv4 PA**；而 **Global Peering 跨区域流量经微软骨干网传输，underlay 用 IPv6**，两端宿主机之间以各自的 **VA_PRIMARY_PA_V6** 互相封装/寻址。

```
源 VM(CA) ──▶ 源宿主机(VA_PRIMARY_PA_V6) ══IPv6 骨干网══▶ 目标宿主机(VA_PRIMARY_PA_V6) ──▶ 目标 VM(CA)
                       ▲                                              │
                       └──────────── 返程（V6 PA 互换）◀─────────────┘
```

- 抓包点：**两端 VM 宿主机各自的 TOR（T0）**
- 在 TOR 上看到的跨区域报文外层是 **IPv6**，5-tuple 为 `SrcIp = 源 VA_PRIMARY_PA_V6`、`DstIp = 目标 VA_PRIMARY_PA_V6`
- 因此 Everflow filter 必须用 **IPv6 /128** 前缀（来自 `VA_PRIMARY_PA_V6`），并写**双向**（正向 + 反向）。

本 skill 自动到 `azurecm` + `aznwmds` 跨集群关联查询，输出**两端 TOR 列表**和**双向 IPv6 Everflow filter JSON**。

---

## 二、输入解析

每台 VM 支持 **三选一** 的输入方式（与 `everflow-vm-to-vm` 一致）：

| 输入形式 | 解析规则 |
|---------|---------|
| 完整 VM resource ID | 取 `/subscriptions/` 后 GUID → `subid`；取 `/virtualMachines/` 后字符串 → `Name`；`ContId` 留空 `''` |
| subId + VM Name | 直接使用；`ContId` 留空 `''` |
| containerId（GUID） | 直接作为 `ContId`；`subid`、`Name` 留空 `''` |

> ⚠️ **重要**：未使用的字段必须填 `''`（空字符串），不能省略，否则 `let` 变量不存在会导致 KQL 解析错误。`subscriptionId =~ subscriptionid` 分支要求两端非空，填空字符串能让该分支自然不匹配。

---

## 三、执行流程

```
Step 0（仅当未直接给 containerId 时）: Query #0 - 解析 containerId
        以 subId + VM Name 查 LogContainerSnapshot(⋈ LogNodeSnapshot) → 拿到 containerId
Step 1: 对源 VM、目标 VM 各执行 Query #1 - 取 TOR
Step 2: 对源 VM、目标 VM 各执行 Query #2 - 取 VA_PRIMARY_PA_V6（IPv6 PA，★ Global peering 关键）
Step 3: 组装输出
        - TOR 列表（逗号分隔）：TOR_src,TOR_dst
        - 双向 IPv6 Everflow filter（正向 src→dst + 反向 dst→src，均用 VA_PRIMARY_PA_V6/128）
```

> Query #1、#2 互不依赖，可对两端 VM 并行执行；若已直接给 containerId 则跳过 Query #0。

---

## 四、核心查询模板

> 公共变量：
> ```kql
> let ContId = '{containerId}';        // 若不以 containerId 输入则填 ''
> let Name   = '{vmName}';             // 若以 containerId 输入则填 ''
> let subid  = '{subscriptionId}';     // 若以 containerId 输入则填 ''
> let _startTime = datetime({startTime});
> let _endTime   = datetime({endTime});
> ```

### Query #0 — 解析 containerId（输入为 subId+Name / resource ID 时）

```kql
let ContId = '';                     // 用 subId+Name 时留空
let Name   = '{vmName}';
let subid  = '{subscriptionId}';
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
let starttime = _startTime; let endtime = _endTime;
let subscriptionid = subid; let roleInstanceName = Name;
let Container =
cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
| where PreciseTimeStamp between (starttime .. endtime)
| where ((isnotempty(subscriptionId) and subscriptionId =~ subscriptionid and isnotempty(roleInstanceName) and roleInstanceName contains Name))
    or (isnotempty(containerId) and containerId == ContId)
| extend ostype = tostring(split(billingType,'|',0)[0])
| extend VMType = tostring(split(billingType,'|')[1])
| summarize STARTTIME=min(TIMESTAMP), ENDTIME=max(TIMESTAMP)
    by nodeId, containerId, tenantName, Tenant, roleInstanceName, containerType,
       virtualMachineUniqueId, subscriptionId, Region, dedicatedHostContainerPlacementType,
       dedicatedHostGroupId, dedicatedHostId, tenantOwners, ostype, VMType;
let Node =
cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogNodeSnapshot
| where TIMESTAMP between (starttime .. endtime)
| summarize arg_max(TIMESTAMP, hostName, machinePoolName) by nodeId;
Container
| join kind=leftouter Node on nodeId
| project STARTTIME, ENDTIME, nodeId, hostName, machinePoolName,
          containerId, tenantName, Tenant, roleInstanceName, containerType,
          virtualMachineUniqueId, subscriptionId, Region,
          dedicatedHostContainerPlacementType, dedicatedHostGroupId, dedicatedHostId,
          tenantOwners, ostype, VMType
| order by ENDTIME desc, Tenant asc, tenantName asc
```

> 拿到 `containerId` 后，把它作为 `ContId` 喂给 Query #1 / Query #2。

### Query #1 — VM 所在 TOR（含 narrow 单行可读输出）

```kql
let ContId = '{containerId}';
let Name   = '{vmName}';             // 若以 containerId 输入则填 ''
let subid  = '{subscriptionId}';     // 若以 containerId 输入则填 ''
let _startTime = datetime({startTime});
let _endTime   = datetime({endTime});
let starttime = _startTime; let endtime = _endTime;
let subscriptionid = subid; let roleInstanceName = Name;
cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
| where PreciseTimeStamp >= starttime and PreciseTimeStamp <= endtime
| where ((isnotempty(subscriptionId) and subscriptionId =~ subscriptionid and isnotempty(roleInstanceName) and roleInstanceName contains Name)) or (isnotempty(containerId) and containerId == ContId)
| summarize arg_max(TIMESTAMP,*) by roleInstanceName,nodeId
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers | extend nodeId = tolower(NodeId)) on $left.nodeId == $right.nodeId
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks | project StartDevice,StartPort,EndDevice,EndPort ) on $left.DeviceName == $right.StartDevice
| join (cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceStatic | project Cluster,Regions,DeviceName,HardwareSku,OSVersion,Vender,FirmwareProfile) on $left.DeviceName == $right.DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface| where isnotempty(AddressesV4) | where InterfaceName =~'HostIP') on DeviceName
| join (cluster('aznwchinamc.chinanorth2').database('aznwmds').DeviceIpInterface| where isnotempty(AddressesV6) | where InterfaceName =~ 'HostIP1') on DeviceName
| order by TIMESTAMP
| project TIMESTAMP,Regions,Cluster,nodeId,containerId,roleInstanceName,ServerName=StartDevice,ServerPort=StartPort,TOR=EndDevice,TORPort=EndPort,HardwareSku,OSVersion,Vender,FirmwareProfile,AddressesV4
| sort by Regions,roleInstanceName
| evaluate narrow()
| project Column, Value
```

> 💡 `evaluate narrow()` 把单行结果转置为 `Column/Value` 两列，便于人工逐字段核对单台 VM。若要批量/程序化取值，可去掉 `| evaluate narrow() | project Column, Value`，直接读 `TOR` 列。
> ⚠️ 取 **`TOR`（= EndDevice）** 拼装 TOR 列表。

### Query #2 — VM 的 VA_PRIMARY_PA_V6（★ Global peering filter 关键）

```kql
let ContId = '{containerId}';
let _endTime = datetime({endTime});
cluster('aznwchinamc.chinanorth2').database('aznwmds').InterfaceAliasProgrammedFiveMinuteTable
| where TIMESTAMP < _endTime
| where ContainerId =~ ContId
| summarize ET=max(TIMESTAMP) by ContainerId, VnetGuid
| order by ET desc | take 1
| join kind=leftouter(
    cluster('aznwchinamc.chinanorth2').database('aznwmds').InterfaceAliasProgrammedFiveMinuteTable
    | where ContainerId =~ ContId
  ) on $left.VnetGuid == $right.VnetGuid
| parse-where kind=regex flags=im Detail with @'VA_HOST_IP_V6=\s*' VA_HOST_IP_V6:string
| extend VA_HOST_IP_V6=tostring(split(split(VA_HOST_IP_V6,',')[0],';')[0])
| parse-where kind=regex flags=im Detail with @'VA_PRIMARY_PA_V6=\s*' VA_PRIMARY_PA_V6:string
| extend VA_PRIMARY_PA_V6=tostring(split(split(VA_PRIMARY_PA_V6,',')[0],';')[0])
| parse-where kind=regex flags=im Detail with @'VA_HLIP_\s*' VA_CA:string
| extend VA_PRIMARY_CA_V4=tostring(split(VA_CA,'=')[0])
| parse-where kind=regex flags=im Detail with @'VA_PRIMARY_PA_V4=\s*' VA_PRIMARY_PA_V4:string
| extend VA_PRIMARY_PA_V4=tostring(split(split(VA_PRIMARY_PA_V4,',')[0],';')[0])
| parse-where kind=regex flags=im Detail with @'VA_HOST_IP_V4=\s*' VA_HOST_IP_V4:string
| extend VA_HOST_IP_V4=tostring(split(split(VA_HOST_IP_V4,',')[0],';')[0])
| extend VnetGuid = trim(@'[{}]', tostring(VnetGuid))
| summarize ST=min(TIMESTAMP), ET=max(TIMESTAMP) by VnetGuid, ContainerId, MACAddress, VA_HOST_IP_V6, VA_PRIMARY_PA_V6, VA_PRIMARY_CA_V4, VA_PRIMARY_PA_V4, VA_HOST_IP_V4
| project ST, ET, VnetGuid, ContainerId, MACAddress, VA_PRIMARY_CA_V4, VA_PRIMARY_PA_V4, VA_PRIMARY_PA_V6, VA_HOST_IP_V6, VA_HOST_IP_V4
| extend VNET_VMLatency_URL = strcat("https://jarvis-west.dc.ad.msft.net/dashboard/User%252Fqliu/VNET/VNET-VMLantency?overrides=[{\"query\":\"//dataSources\",\"key\":\"account\",\"replacement\":\"VNetMDM_MC\"},{\"query\":\"//*[id='SrcVNetId']\",\"key\":\"value\",\"replacement\":\"{", VnetGuid, "}\"},{\"query\":\"//*[id='SrcCluster']\",\"key\":\"value\",\"replacement\":\"\"},{\"query\":\"//*[id='SrcContainerId']\",\"key\":\"value\",\"replacement\":\"", ContainerId, "\"},{\"query\":\"//*[id='SrcCA']\",\"key\":\"value\",\"replacement\":\"\"},{\"query\":\"//*[id='SrcNodeId']\",\"key\":\"value\",\"replacement\":\"\"}]%20")
```

**字段提取**：

| 输出列 | 用途 |
|--------|------|
| **`VA_PRIMARY_PA_V6`** | ★ 宿主机 IPv6 PA → Everflow filter 的 `SrcIpPrefix` / `DstIpPrefix`（加 `/128`） |
| `VA_PRIMARY_PA_V4` | 同区域 V4 PA，仅供参考（Global peering 不用它做 filter） |
| `VA_PRIMARY_CA_V4` | VM 内部 CA，仅供参考 |
| `VnetGuid` | VNet GUID，配合 `VNET_VMLatency_URL` 看跨区域延迟仪表盘 |

---

## 五、关键坑（必读）

1. **Global peering 必须用 IPv6 PA**：跨区域流量在 TOR 上外层是 IPv6，filter 用 `VA_PRIMARY_PA_V6`（/128）。误用 V4 PA 会抓不到跨区域封装流量。
2. **`Servers.NodeId` 大写、`LogContainerSnapshot.nodeId` 小写**：Query #1 已用 `extend nodeId = tolower(NodeId)` 统一；若自行改写需保证大小写一致，否则 join 命中 0 行。
3. **未用字段填 `''`**：`ContId`/`Name`/`subid` 三者按输入方式，未用的填空字符串。
4. **双向 filter**：Global peering 要抓双向，filter 写正向 + 反向两条。
5. **VA_PRIMARY_PA_V6 取第一个**：`parse` 后已 `split(...)[0]` 取首个地址；若一台 VM 多 VNet/多 NIC，按实际排查的 VnetGuid 选对应记录。

---

## 六、输出格式

### 1. TOR 列表（逗号分隔）

```
{TOR_src},{TOR_dst}
```

- 取两端 Query #1 的 `TOR`，逗号分隔（不带空格），用于在源/目标两台 TOR 上同时抓包。

### 2. Everflow Filter（IPv6，双向）

```json
[
  {"SrcIpPrefix":"{src_VA_PRIMARY_PA_V6}/128","DstIpPrefix":"{dst_VA_PRIMARY_PA_V6}/128","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{dst_VA_PRIMARY_PA_V6}/128","DstIpPrefix":"{src_VA_PRIMARY_PA_V6}/128","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

**字段映射**：

| Filter 字段 | 来源 |
|------------|------|
| 第 1 条 `SrcIpPrefix` | 源 VM `VA_PRIMARY_PA_V6` + `/128` |
| 第 1 条 `DstIpPrefix` | 目标 VM `VA_PRIMARY_PA_V6` + `/128` |
| 第 2 条 `SrcIpPrefix` | 目标 VM `VA_PRIMARY_PA_V6` + `/128`（反向） |
| 第 2 条 `DstIpPrefix` | 源 VM `VA_PRIMARY_PA_V6` + `/128`（反向） |
| `SrcPort`/`DstPort`/`Protocol`/`TcpFlags`/`Dscp` | 固定 0 |

> 📌 **备注：提交 filter 配置时，请勾选 IPV6 选项。**（Global peering 用的是 IPv6 PA，未勾选 IPv6 会导致 filter 不生效）

---

## 七、端到端示例

**输入**：源/目标 VM（任一形式）+ 时间范围最近 2 天。

**Query #2 结果**（假设两端 V6 PA）：

| 角色 | TOR | VA_PRIMARY_PA_V6 |
|------|-----|------------------|
| 源 | TOR_src | `2406:e500:a101:8369:0:1:65:10d1` |
| 目标 | TOR_dst | `2406:e500:a602:8003:0:1:12:ca1a` |

**最终输出**：

TOR 列表：
```
TOR_src,TOR_dst
```

Everflow Filter（双向 IPv6）：
```json
[{"SrcIpPrefix":"2406:e500:a101:8369:0:1:65:10d1/128","DstIpPrefix":"2406:e500:a602:8003:0:1:12:ca1a/128","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},{"SrcIpPrefix":"2406:e500:a602:8003:0:1:12:ca1a/128","DstIpPrefix":"2406:e500:a101:8369:0:1:65:10d1/128","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}]
```

> 📌 **备注：提交 filter 配置时，请勾选 IPV6 选项。**

---

## 八、与 everflow-vm-to-vm 的区别

| 维度 | everflow-vm-to-vm（同区域） | everflow-global-peering（跨区域） |
|------|---------------------------|----------------------------------|
| underlay | IPv4 PA | **IPv6 PA（VA_PRIMARY_PA_V6）** |
| filter 前缀 | `AddressesV4/32` | **`VA_PRIMARY_PA_V6/128`** |
| 取 PA 的表 | `DeviceIpInterface`（HostIP AddressesV4） | **`InterfaceAliasProgrammedFiveMinuteTable`（解析 Detail）** |
| 双向规则 | 有 | 有 |
| TOR 查询 | 相同（LogContainerSnapshot ⋈ aznwmds.*） | 相同 |

---

## 相关 Skills

- [`everflow-vm-to-vm.md`](./everflow-vm-to-vm.md) — 同区域 VM 到 VM（IPv4 PA）
- [`everflow-slb.md`](./everflow-slb.md) — SLB / AppGW / AzFW 公网入流量
