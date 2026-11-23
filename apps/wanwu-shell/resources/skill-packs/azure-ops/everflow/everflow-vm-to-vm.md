---
name: everflow-vm-to-vm
description: VM to VM 场景下，准备 Everflow 抓包配置。输入源 VM 和目标 VM 信息（支持完整 VM resource ID、subId+VM Name 或 containerId 三种形式），自动查询并输出两端的 TOR 设备列表和 Everflow filter 规则（含双向流量）。触发词：everflow、抓包、VM to VM、TOR 查询、PA 地址、网络抓包准备
tables:
  - cluster('azurecm.chinanorth2.kusto.chinacloudapi.cn').database('azurecm').LogContainerSnapshot
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').Servers
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceInterfaceLinks
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceStatic
  - cluster('aznwchinamc.chinanorth2.kusto.chinacloudapi.cn').database('aznwmds').DeviceIpInterface
parameters:
  - name: srcVmInput
    required: true
    description: 源 VM 信息。任选一种格式：(1) 完整 VM resource ID，例如 /subscriptions/<subId>/resourceGroups/<rg>/providers/Microsoft.Compute/virtualMachines/<vmName>；(2) subId + VM Name 组合；(3) containerId（GUID）
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

# VM to VM Everflow 抓包准备

在做 VM 到 VM 网络抓包（Everflow）前，需要两份关键信息：

1. **两台 VM 各自落在哪台 TOR 上** —— 用于决定在哪两台交换机上部署抓包
2. **两台 VM 的 PA（Physical Address，宿主机 V4 IP）** —— 用于构造 Everflow filter 规则

本 skill 自动到 `azurecm` + `aznwmds` 跨集群关联查询，输出最终用于抓包的 **TOR 列表** 和 **Everflow filter JSON**。

---

## 一、输入解析

每台 VM 支持 **三选一** 的输入方式：

| 输入形式 | 示例 | 解析规则 |
|---------|------|---------|
| 完整 VM resource ID | `/subscriptions/ea58df11-3f3e-4efc-8adc-2f27b4092480/resourceGroups/potrrmcninfresgp003/providers/Microsoft.Compute/virtualMachines/potrrmcninfvmfg003` | 取 `/subscriptions/` 后的 GUID → `subid`；取 `/virtualMachines/` 后的字符串 → `Name`；`ContId` 留空 |
| subId + VM Name | `subid = ea58df11-...`、`name = POTRRMCNINFVMFG003` | 直接使用；`ContId` 留空 |
| containerId | `f3ba360e-9d8a-4214-85e3-fe26bdf47b75` | 直接作为 `ContId`；`subid` 和 `Name` **留空字符串** `''` |

> ⚠️ **重要**：未使用的字段必须填 `''`（空字符串），不能省略，否则 `let` 变量不存在会导致 KQL 解析错误。
> 原查询中 `subscriptionId =~ subscriptionid` 这个分支要求两端都非空，所以填空字符串能让该分支自然不匹配。

---

## 二、执行流程

```
Step 1: 解析源 VM 输入       → (ContId_src, subid_src, Name_src)
Step 2: 解析目标 VM 输入     → (ContId_dst, subid_dst, Name_dst)
Step 3: 对源 VM 执行核心查询 → 提取 TOR_src, PA_src (AddressesV4)
Step 4: 对目标 VM 执行核心查询 → 提取 TOR_dst, PA_dst (AddressesV4)
Step 5: 组装输出
   - TOR 列表（逗号分隔）：TOR_src,TOR_dst
   - Everflow filter JSON（正向 + 反向两条规则）
```

> 核心查询要 **执行两次**（源 VM 一次、目标 VM 一次），每次替换为该 VM 自己的参数。

---

## 三、核心查询模板

```kql
let ContId = '{containerId}';        // 若不以 containerId 输入则填 ''
let Name   = '{vmName}';             // 若以 containerId 输入则填 ''
let subid  = '{subscriptionId}';     // 若以 containerId 输入则填 ''
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

**字段提取**：

| 输出字段 | 来源列 | 用途 |
|---------|-------|------|
| **TOR** | `EndDevice`（DeviceInterfaceLinks） | 拼装 TOR 列表 |
| **PA (V4)** | `AddressesV4`（DeviceIpInterface，HostIP 接口） | 拼装 Everflow filter |

> ⚠️ `AddressesV4` 是数组形式，**取第一个元素**即可；如果同一 VM 落在的宿主机有多个 HostIP V4，按实际抓包需求挑选。

---

## 四、输出格式

### 1. TOR 信息（逗号分隔）

```
{TOR_src},{TOR_dst}
```

**示例**：

```
zqz20-0101-0609-10t0,zqz22-0101-0606-14t0
```

> 用于同时在源 / 目标两台 TOR 设备上部署抓包。

### 2. Everflow Filter（JSON，含双向规则）

```json
[
  {"SrcIpPrefix":"{PA_src}/32","DstIpPrefix":"{PA_dst}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"{PA_dst}/32","DstIpPrefix":"{PA_src}/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

**字段映射**：

| Filter 字段 | 来源 |
|------------|------|
| 第 1 条 `SrcIpPrefix` | 源 VM 的 `AddressesV4` + `/32` |
| 第 1 条 `DstIpPrefix` | 目标 VM 的 `AddressesV4` + `/32` |
| 第 2 条 `SrcIpPrefix` | 目标 VM 的 `AddressesV4` + `/32`（反向） |
| 第 2 条 `DstIpPrefix` | 源 VM 的 `AddressesV4` + `/32`（反向） |
| `SrcPort` / `DstPort` / `Protocol` / `TcpFlags` / `Dscp` | 全部固定为 0 |

> ✅ 第 2 条 filter 是反向流量；两台 TOR 都要抓到双向，才能完整还原 VM 到 VM 的会话。

---

## 五、端到端示例

**输入**：

- 源 VM：完整 resource ID
  `/subscriptions/ea58df11-3f3e-4efc-8adc-2f27b4092480/resourceGroups/potrrmcninfresgp003/providers/Microsoft.Compute/virtualMachines/potrrmcninfvmfg003`
- 目标 VM：`containerId = f3ba360e-9d8a-4214-85e3-fe26bdf47b75`
- 时间范围：`2026-05-19T00:52:55Z ~ 2026-05-21T00:52:55Z`

**Step 1-2 参数解析**：

| VM | ContId | subid | Name |
|----|--------|-------|------|
| 源 | `''` | `ea58df11-3f3e-4efc-8adc-2f27b4092480` | `potrrmcninfvmfg003` |
| 目标 | `f3ba360e-9d8a-4214-85e3-fe26bdf47b75` | `''` | `''` |

**Step 3-4 查询结果**（假设）：

| 角色 | TOR | AddressesV4 |
|------|-----|-------------|
| 源 | `zqz20-0101-0609-10t0` | `10.42.77.1` |
| 目标 | `zqz22-0101-0606-14t0` | `10.42.77.222` |

**Step 5 最终输出**：

```
TOR:
zqz20-0101-0609-10t0,zqz22-0101-0606-14t0

Everflow Filter:
[
  {"SrcIpPrefix":"10.42.77.1/32","DstIpPrefix":"10.42.77.222/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"},
  {"SrcIpPrefix":"10.42.77.222/32","DstIpPrefix":"10.42.77.1/32","SrcPort":"0","DstPort":"0","Protocol":0,"TcpFlags":0,"Dscp":"0"}
]
```

---

## 六、常见问题排查

| 现象 | 原因 | 处理 |
|------|------|------|
| 查询返回空结果 | VM 在时间窗口内未上报 `LogContainerSnapshot` | 扩大时间窗口；或确认 VM 是否处于 Running 状态 |
| 同一 VM 出现多条记录 | VM 经历过 Live Migration / Service Healing | `arg_max(TIMESTAMP, *)` 已聚合到最新一条；如需迁移历史可去掉该聚合 |
| `AddressesV4` 为空 | DeviceIpInterface 中 HostIP 接口未上报 | 检查 `InterfaceName` 大小写；或换 `HostIP1` 等其他接口名验证 |
| `roleInstanceName contains Name` 误匹配多台 VM | VM Name 是其他 VM Name 的前缀（如 `vm01` 命中 `vm010`） | **改用 containerId 输入方式**，精确匹配 |
| Resource ID 中大小写解析错误 | VM Name 在 Resource ID 中是小写，在 `roleInstanceName` 中可能是大写 | `contains` 默认大小写不敏感，无需特别处理 |

---

## 七、Skill 调用示例（自然语言触发）

> "帮我做 VM 到 VM 的 everflow 抓包准备，源 VM 是 `/subscriptions/ea58df11-.../virtualMachines/potrrmcninfvmfg003`，目标 VM 的 containerId 是 `f3ba360e-9d8a-4214-85e3-fe26bdf47b75`，时间范围最近 2 天"

> "VM `xxx` 和 VM `yyy` 的 TOR 和 PA 是多少？给我 Everflow filter"

---

