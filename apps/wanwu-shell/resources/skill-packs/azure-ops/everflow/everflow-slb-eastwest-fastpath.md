---
name: everflow-slb-eastwest-fastpath
description: 为东西向 SLB Fast Path 场景准备源、目的 T0 的 Everflow 抓包配置。输入源 VM VIP 和目标 SLB VIP，自动解析两端 Mux PA、源 VM PA、目标后端 PA/TOR，并在两端生成 Mux 规则及 VIP/PA 两种 bypass-Mux 正反向规则。适用于首包经过 Mux、后续报文在 VM 宿主机之间直通的场景。触发词：SLB fast path、SLB bypass mux、东西向 Everflow、东西向 fast path、Mux 回包抓包
tables:
  - cluster('azslbmc.kusto.chinacloudapi.cn').database('azslbmdsmc').OutboundProbeResultHistoryEvent
  - cluster('azslbmc.kusto.chinacloudapi.cn').database('azslbmdsmc').DipEndpointProbeHistoryEvent
  - cluster('azslbmc.kusto.chinacloudapi.cn').database('azslbmdsmc').VipRangesSnapshotEvent
  - cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceIpInterface
parameters:
  - name: sourceVmVip
    required: true
    description: 源 VM 的公网 VIP，例如 159.27.13.189。
  - name: targetSlbVip
    required: true
    description: 目标 SLB 的前端 VIP，例如 159.27.234.208。
  - name: sourceVmPa
    required: false
    description: 源 VM 宿主机 PA。默认通过 OutboundProbeResultHistoryEvent 从 sourceVmVip 自动解析；查询不到时必须提供。
  - name: startTime
    required: false
    description: UTC ISO 8601 查询开始时间，默认 endTime - 2d。
  - name: endTime
    required: false
    description: UTC ISO 8601 查询结束时间，默认 now()。
---

# 东西向 SLB Fast Path Everflow 抓包准备

## 适用路径

该场景的首包和持续流量并不走同一条路径：

```text
首包（Mux 路径）:
SLB Mux PA ── VXLAN/GRE ──> Source VM Host PA

后续报文（Fast Path / bypass-Mux）:
Source VM Host PA <────────────> Target SLB Backend Host PA
```

因此必须在源 VM TOR 和目标后端 VM TOR 部署不同的 filter。不要用目标后端 PA 作为源 VM TOR 上的 Mux filter 目标；该 filter 的目标始终是源 VM 宿主机 PA。

## 执行流程

1. 用 Query #1 从 `sourceVmVip` 解析源 VM 的 `ContainerId` 和 `SourceVmPA`。如果用户给了 `sourceVmPa`，仍查询 ContainerId 用于解析 TOR。
2. 用 Query #2 查询源 VM 的 TOR，并用 `AddressesV4` 校验 `SourceVmPA`。
3. 用 Query #3 分别以 `sourceVmVip` 和 `targetSlbVip` 执行两次，得到源 SLB Mux PA 和目标 SLB Mux PA。
4. 用 Query #4 找出 `targetSlbVip` 的全部健康后端 VM `BackendPA` 和 ContainerId。
5. 用 Query #2 查询目标后端 VM 的 TOR。
6. 生成两组完整配置：
   - 源 T0：源 Mux 至源 VM PA、`sourceVmVip -> targetSlbVip`，以及每个后端的 VIP/PA Fast Path 正反向规则。
   - 目的 T0：目标 Mux 至每个目标后端 PA、`targetSlbVip -> sourceVmVip`，以及同一组 VIP/PA Fast Path 正反向规则。

## Query #1 - 解析源 VM PA 和 ContainerId

```kql
let SourceVip = '{sourceVmVip}';
let _startTime = datetime({startTime});
let _endTime = datetime({endTime});
cluster('azslbmc.kusto.chinacloudapi.cn').database('azslbmdsmc').OutboundProbeResultHistoryEvent
| where TIMESTAMP between (_startTime .. _endTime)
| where Vip == SourceVip and isnotempty(ContainerId)
| summarize LastIngressTime = max(PreciseTimeStamp)
    by Vip, HostPA = Ip, DipPA = Dip, DipCA, ContainerId, NodeId,
       SubscriptionId, NrpLoadBalancerId, VnetId
| project LastIngressTime, Vip, HostPA, DipPA, DipCA, ContainerId, NodeId,
          SubscriptionId, NrpLoadBalancerId, VnetId
| order by LastIngressTime desc
```

取最新记录的 `HostPA` 作为 `SourceVmPA`。若无结果，要求用户提供 `sourceVmPa` 和源 VM resource ID 或 ContainerId。

## Query #2 / #5 - 按 ContainerId 查询 VM TOR

```kql
let ContIds = dynamic([{containerIdList}]);
let _startTime = datetime({startTime});
let _endTime = datetime({endTime});
cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
| where PreciseTimeStamp between (_startTime .. _endTime)
| where containerId in (ContIds)
| summarize arg_max(TIMESTAMP, *) by roleInstanceName, nodeId
| join kind=inner (
    cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers
    | extend nodeId = tolower(NodeId)
) on $left.nodeId == $right.nodeId
| join kind=inner (
    cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks
    | project StartDevice, StartPort, EndDevice, EndPort
) on $left.DeviceName == $right.StartDevice
| join kind=inner (
    cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceIpInterface
    | where isnotempty(AddressesV4) and InterfaceName =~ 'HostIP'
) on DeviceName
| project TIMESTAMP, containerId, roleInstanceName, ServerName = StartDevice,
          TOR = EndDevice, TORPort = EndPort, AddressesV4
```

## Query #3 - 指定 VIP 的 Mux PA 和 TOR

```kql
let SlbVip = '{slbVip}';
let RingNames =
    cluster('azslbmc.kusto.chinacloudapi.cn').database('azslbmdsmc').VipRangesSnapshotEvent
    | where env_time > ago(4h)
    | where env_cloud_location != '<null>'
    | where ipv4_is_in_range(SlbVip, VipRange)
    | summarize make_list(RingName);
cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
| where TIMESTAMP > ago(4h)
| where tenantName has_any (RingNames)
| summarize arg_max(TIMESTAMP, *) by tenantName, nodeId
| join kind=inner (
    cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers
    | extend nodeId = tolower(NodeId)
) on $left.nodeId == $right.nodeId
| join kind=inner (
    cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks
    | project StartDevice, StartPort, EndDevice, EndPort
) on $left.DeviceName == $right.StartDevice
| join kind=inner (
    cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceIpInterface
    | where isnotempty(AddressesV4) and InterfaceName =~ 'HostIP'
) on DeviceName
| project tenantName, roleInstanceName, MuxPA = AddressesV4, MuxTOR = EndDevice
| sort by tenantName, roleInstanceName
```

## Query #4 - 目标 SLB 后端 PA

```kql
let TargetSlbVip = '{targetSlbVip}';
let _startTime = datetime({startTime});
let _endTime = datetime({endTime});
cluster('azslbmc.kusto.chinacloudapi.cn').database('azslbmdsmc').DipEndpointProbeHistoryEvent
| where TIMESTAMP between (_startTime .. _endTime)
| where Vip == TargetSlbVip
| summarize TIMESTAMP = max(TIMESTAMP)
    by Vip, NodeIp = Ip, ContainerId, NodeId, DipCA, ProbeStatus, Region
| project TIMESTAMP, Vip, BackendPA = NodeIp, ContainerId, NodeId, DipCA, ProbeStatus, Region
| order by TIMESTAMP desc
```

保留所有后端；如只排查健康实例，可加 `| where ProbeStatus == 'Up'`。

## 输出格式

所有规则字段 `SrcPort`、`DstPort`、`Protocol`、`TcpFlags`、`Dscp` 固定为 `0`、`0`、`0`、`0`、`"0"`。

### A. 源 T0 完整 filter

部署 TOR：源 VM 的 `TOR`。

```json
[
  {"SrcIpPrefix":"{SourceMuxPA}/32","DstIpPrefix":"{SourceVmPA}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{SourceVmVip}/32","DstIpPrefix":"{TargetSlbVip}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{SourceVmPA}/32","DstIpPrefix":"{BackendPA}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{SourceVmVip}/32","DstIpPrefix":"{BackendPA}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{BackendPA}/32","DstIpPrefix":"{SourceVmPA}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{BackendPA}/32","DstIpPrefix":"{SourceVmVip}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

其中第一条为每个去重后的 `SourceMuxPA` 生成；后四种 Fast Path 规则为每个 `BackendPA` 生成。`SourceVmVip -> BackendPA` 和 `SourceVmPA -> BackendPA` 必须同时存在，不能二选一。

### B. 目的 T0 完整 filter

部署 TOR：每个目标后端 VM 的 `TOR`。

```json
[
  {"SrcIpPrefix":"{TargetMuxPA}/32","DstIpPrefix":"{BackendPA}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{TargetSlbVip}/32","DstIpPrefix":"{SourceVmVip}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{SourceVmPA}/32","DstIpPrefix":"{BackendPA}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{SourceVmVip}/32","DstIpPrefix":"{BackendPA}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{BackendPA}/32","DstIpPrefix":"{SourceVmPA}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{BackendPA}/32","DstIpPrefix":"{SourceVmVip}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

第一条按 `TargetMuxPA × BackendPA` 笛卡尔积生成；后四条 Fast Path 规则为每个 `BackendPA` 生成。目的 T0 上必须保留 VIP 和 PA 两种 Fast Path 正向规则，以及它们各自的反向规则。

## 规则校验

- 源 T0 的源 Mux 规则必须为 `SourceMuxPA -> SourceVmPA`；其目标绝不能是 `BackendPA`。
- 目的 T0 的目标 Mux 规则必须为 `TargetMuxPA -> BackendPA`。
- 对每个 `BackendPA`，两端都必须包含 `SourceVmVip -> BackendPA`、`SourceVmPA -> BackendPA`、`BackendPA -> SourceVmVip`、`BackendPA -> SourceVmPA` 四条 Fast Path 规则。
- `SourceMuxPA` 和 `TargetMuxPA` 必须分别从 `sourceVmVip` 与 `targetSlbVip` 反查，不能混用。
