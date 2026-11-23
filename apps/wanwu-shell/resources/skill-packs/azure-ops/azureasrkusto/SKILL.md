---
name: "azureasrkusto"
description: "通过 Kusto MCP 查询 Azure Data Explorer 集群中存储的的日志记录，可以查询Azure Site Recovery中复制任务的运行情况，用于Azure Site Recovery的监控和故障排除"
---



# Azure Site Recovery (ASR) Kusto查询技能手册


## 数据源配置

### Kusto集群连接信息
- **ASR主集群**: `https://asradxclusmc.chinanorth2.kusto.chinacloudapi.cn`
  - 数据库: `ASRKustoDB`
- **备份集群**: `https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn/`
  - 数据库: `MABKustoProd`
- **Resource Mover集群**: `https://rmskustomc.chinanorth2.kusto.chinacloudapi.cn/`
  - 数据库: `RMSKustoDB`
- **页面访问统计集群**: `https://mckusto.chinanorth3.kusto.chinacloudapi.cn/`
  - 数据库: `kusto`, `microsoft`



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

## 常用参数

- `_customerSubID`: 客户订阅ID
- `_protectedItemId`: 受保护项目ID
- `_applianceHostId`: 设备主机ID
- `_clientRequestId`: 客户端请求ID
- `_VMName`: 虚拟机名称
- `_ApplianceName`: 设备名称
- `_startTime`: 开始时间
- `_endTime`: 结束时间


## 需要遵守的建议
  - 下面列出的查询表是必须要查询到的表
  - 查询完成给出分析结果后，必须给出你使用的kusto查询语句以及分析到的关键日志，用于证明分析结论
  - 下面列出的表，不是数据库中所有的表，如果没有查询到结果，请查询数据库中尽可能多的表，查询表的结构，并分析是否与查询的主题相关，如果相关，则需要查询对应表的日志
  - 全程保持客观、专业，不编造数据

---


# 查询方法
## 1. V2A/P2A Modernized 查询

### 1.1 获取受保护项目详情
```kusto
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').SRSShoeboxEvent
| where PreciseTimeStamp > _startTime and PreciseTimeStamp < _endTime
| where category == "AzureSiteRecoveryReplicatedItems" 
| parse resourceId with * "/SUBSCRIPTIONS/" vaultSubscription "/RESOURCEGROUPS" *
| extend vaultSubscription = tolower(vaultSubscription)
| where vaultSubscription == _customerSubID
| extend parsedProperties = parse_json(properties)
| where parsedProperties.replicationProviderName contains "InMageRcm"
| extend ApplianceHostId=iif(tostring(parsedProperties.processServerId)!= "",tostring(parsedProperties.processServerId),tostring(parsedProperties.recoveryServicesProviderId))
| summarize arg_max(PreciseTimeStamp, *) by tostring(parsedProperties.correlationId)
| project 
PreciseTimeStamp, 
ProtectedItemId=tostring(parsedProperties.machineId), 
ProtectedItemName=tostring(parsedProperties.name), 
AgentVersion = tostring(todynamic(properties).agentVersion),
OS=tostring(parsedProperties.osFamily),
LastHeartbeat = parsedProperties.lastHeartbeat,
ReplicationHealth=tostring(parsedProperties.replicationHealth), 
ProtectionState=tostring(parsedProperties.protectionState),
RPOMins=toint(parsedProperties.rpoInSeconds)/60,
ReplicationhealthErrors=(parsedProperties.replicationHealthErrors),
ApplianceName = tostring(parsedProperties.processServerName), 
ApplianceHostId,
CurrentLocation = iif(parsedProperties.activeLocation == "Primary", parsedProperties.primaryFabricType, parsedProperties.recoveryFabricName),
properties
| order by PreciseTimeStamp desc
```

### 1.2 操作事件查询
```kusto
cluster("asradxclusmc.chinanorth2.kusto.chinacloudapi.cn").database("ASRKustoDB").SRSOperationEvent
| where SubscriptionId == _customerSubID and TIMESTAMP > _startTime
| where IsUserVisibleWorkflow == true
| where WorkflowName != "ParentAddHostToPairedCloudWorkflow"
| where ObjectName != ""
| where ObjectName contains _VMName
| where WorkflowName != "GetMonitoringJobsWorkflow" 
| where WorkflowName != "WaitForUpdateFabricLayoutWorkFlow"
| project TIMESTAMP, ObjectName, ScenarioName, State, ClientRequestId, WorkflowName
| order by TIMESTAMP
```

### 1.3 数据事件日志
```kusto
cluster("asradxclusmc.chinanorth2.kusto.chinacloudapi.cn").database("ASRKustoDB").SRSDataEvent
| where TIMESTAMP > _startTime
| where ClientRequestId == _clientRequestId
| project TIMESTAMP, Level, Message
```

### 1.4 错误事件查询
```kusto
cluster("asradxclusmc.chinanorth2.kusto.chinacloudapi.cn").database("ASRKustoDB").SRSErrorEvent
|where ClientRequestId == _clientRequestId
| where SubscriptionId == _customerSubID
| where TIMESTAMP > _startTime
|project TIMESTAMP, ErrorCode ,ErrorCodeName, Message
```

---

## 2. 设备监控查询

### 2.1 设备吞吐量监控
```kusto
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').RcmAgentAdminEvent
| where AgentTimeStamp > _startTime
| where MachineId == _applianceHostId
| where Message contains "actualthroughput :" 
| parse Message with "actualThroughput : " actualThroughputStr " MBps, expectedThroughput : " expectedThroughputStr " MBps, uploadpendingdata : " uploadpendingdataStr " MB, uploadeddata : " uploadeddataStr " MB, datatransfertime : " datatransfertimeStr ", healthMonitoringInterval : " healthMonitoringIntervalStr
| extend actualThroughput = todouble(replace(",", ".", actualThroughputStr)),
         expectedThroughput = todouble(replace(",", ".", expectedThroughputStr)),
         uploadpendingdata = todouble(uploadpendingdataStr),
         uploadeddata = todouble(uploadeddataStr)
| project AgentTimeStamp, uploadeddata, uploadpendingdata
| sort by AgentTimeStamp desc
| render timechart
```

### 2.2 设备健康状态
```kusto
cluster("asradxclusmc.chinanorth2.kusto.chinacloudapi.cn").database("ASRKustoDB").SRSDataEvent
| where SubscriptionId == _customerSubID
| where PreciseTimeStamp >= _startTime and PreciseTimeStamp < _endTime
| where Message contains "ApplianceHealthHandler "
| where SRSEventName == "SRSInformation"
| parse Message with * "\"Id\": \"" ApplianceHostId "\",\" * "Name\": \"" ApplianceName "\",\" * "LastHeartbeatUtc\": \"" LastHearbeat "\",\" * "IpAddresses\": [" IPAddress "]" *
| summarize arg_max(PreciseTimeStamp, *) by tostring(ApplianceName)
| join kind=inner (
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').TelemetryPerVaultInfo
| where PreciseTimeStamp > _startTime
| parse VaultArmId with * "Microsoft.RecoveryServices/vaults/" VaultName
| project VaultName, ResourceId
) on ResourceId
| where ApplianceName contains _ApplianceName
| summarize arg_max(PreciseTimeStamp, *) by tostring(ApplianceName)
| order by ApplianceName asc
| project ApplianceName, ApplianceHostId, LastHearbeat, VaultName, Region, IPAddress
```

---

## 3. 复制监控查询

### 3.1 复制健康状态汇总
```kusto
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').SRSShoeboxEvent
| where PreciseTimeStamp > _startTime and PreciseTimeStamp < _endTime
| where category == "AzureSiteRecoveryReplicatedItems"
| parse resourceId with * "/SUBSCRIPTIONS/" vaultSubscription "/RESOURCEGROUPS" *
| extend vaultSubscription = tolower(vaultSubscription)
| where vaultSubscription == _customerSubID
| extend parsedProperties = parse_json(properties)
| order by PreciseTimeStamp asc
```

### 3.2 保护状态统计
```kusto
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').SRSShoeboxEvent
| where PreciseTimeStamp > _startTime and PreciseTimeStamp < _endTime
| where category == "AzureSiteRecoveryReplicatedItems"
| parse resourceId with * "/SUBSCRIPTIONS/" vaultSubscription "/RESOURCEGROUPS" *
| extend vaultSubscription = tolower(vaultSubscription)
| where vaultSubscription == _customerSubID
| extend parsedProperties = parse_json(properties)
| where parsedProperties.replicationProviderName contains "InMageRcm"
| summarize arg_max(PreciseTimeStamp, *) by tostring(parsedProperties.correlationId)
| extend VMProtectionState = tostring(parsedProperties.protectionState)
| extend Source = iif(tostring(parsedProperties.processServerName)!="",tostring(parsedProperties.processServerName), tostring(parsedProperties.primaryFabricType))
| summarize count() by VMProtectionState, Source
| where Source contains _ApplianceName
| project Source, VMProtectionState, Machines=count_
| order by Source asc
```

---

## 4. 错误和诊断查询

### 4.1 推送安装诊断
```kusto
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').PushInstallAgentDiagnosticEvent
| where ClientRequestId == _clientRequestId
| where PreciseTimeStamp > _startTime
| where Message != ""
| project PreciseTimeStamp, Message
```

### 4.2 CB引擎跟踪消息
```kusto
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').RcmCBEngineTraceMessages
| where AgentMachineId == toupper(tostring(_protectedItemId))
| where PreciseTimeStamp > _startTime
| project PreciseTimeStamp, ServiceEventName, Message
| order by PreciseTimeStamp desc
```

### 4.3 设备诊断事件
```kusto
cluster("asradxclusmc.chinanorth2.kusto.chinacloudapi.cn").database("ASRKustoDB").MarsAgentDiagnosticEvent
| where PreciseTimeStamp > _startTime
| where ApplianceId == _applianceHostId
| project PreciseTimeStamp, Message, ServiceEventName, ClientRequestId
```

---

## 5. Hyper-V 监控查询

### 5.1 Hyper-V 受保护项目
```kusto
let customerSubID = _customerSubID;
let startTime = _startTime;
let endTime = _endTime;
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').SRSShoeboxEvent 
| where PreciseTimeStamp > startTime and PreciseTimeStamp < endTime
| where category == "AzureSiteRecoveryReplicatedItems"
| where resourceId has customerSubID
| extend parsedProperties = parse_json(properties)
| where parsedProperties.primaryFabricType contains "Hyper" or parsedProperties.primaryFabricType contains "VMM"
| where parsedProperties.name contains _VMName
| extend ProtectedItemID = parsedProperties.correlationId
| parse ProtectedItemID with * "replicationProtectedItems/" ProtectedItemID
| summarize arg_max(PreciseTimeStamp, *) by tostring(parsedProperties.correlationId)
| project
    Tool=iif(strcat("default", tostring(parsedProperties.primaryFabricName), "-policy") == tostring(parsedProperties.policyName), "Migrate", "ASR"), 
    PreciseTimeStamp,
    ProtectedItemId=tostring(ProtectedItemID), 
    DataStoreId=tostring(parsedProperties.datasourceResourceId), 
    ProtectedItemName=tostring(parsedProperties.name), 
    TargetLocation = tostring(parsedProperties.recoveryFabricName),
    ReplicationHealth=tostring(parsedProperties.replicationHealth), 
    ProtectionState=tostring(parsedProperties.protectionState), 
    Completion=tostring(parsedProperties.initialReplicationProgressPercentage), 
    OS=tostring(parsedProperties.osFamily), 
    Provider = tostring(parsedProperties.primaryFabricName), 
    Stack = tostring(parsedProperties.primaryFabricType), 
    StorageAccount = tostring(parsedProperties.targetStorageAccountName),
    ReplicationhealthErrors=parsedProperties.replicationHealthErrors,
    parsedProperties
| order by PreciseTimeStamp desc
```

### 5.2 Hyper-V 同步会话统计
```kusto
let startTime = _startTime;
let endTime = _endTime;
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').HvrApplySyncSessionStats
| where PreciseTimeStamp > startTime and PreciseTimeStamp < endTime
| where DataSourceId == _dataSourceIdHv
| project PreciseTimeStamp, DiskId, DiskSizeMB, VhdStorageAccountName, UncompressedFileSizeKB, DiffBlobSizeKB,TotalWrites, TotalWritesBlockedForAsyncIOLimit, TotalWritesBlockedForOverlap, DataSourceId
```

---

## 6. A2A (Azure到Azure) 监控查询

### 6.1 A2A 受保护项目详情
```kusto
let customerSubID = _customerSubID;
let startTime = _startTime;
let endTime = _endTime;
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').SRSShoeboxEvent 
| where PreciseTimeStamp > _startTime and PreciseTimeStamp < _endTime
| where resourceId has _customerSubID
| extend parsedProperties = parse_json(properties)
| where properties contains _VMName
| order by PreciseTimeStamp asc
```

---

## 7. 机器发现查询

### 7.1 发现的虚拟机
```kusto
union 
(cluster("asradxclusmc.chinanorth2.kusto.chinacloudapi.cn").database("ASRKustoDB").SRSDataEvent)
| where PreciseTimeStamp >= _startTime
| where SubscriptionId == _customerSubID
| where SRSEventName == "SRSInformation"
| where Message contains '\"KindOfEntity\": \"RcmComponent\"'
| parse Message with * "\"Id\": \"" ApplianceId "\",\" * "Name\": \"" ApplianceName "\",\" * "LastHeartbeatUtc\": \"" LastHearbeat "\",\" *
| extend ApplianceName = tolower(ApplianceName)
| distinct ApplianceName, ApplianceId
| join kind=inner (
union
(cluster("asradxclusmc.chinanorth2.kusto.chinacloudapi.cn").database("ASRKustoDB").FdsTelemetryEvent)
| where PreciseTimeStamp > _startTime
| where SubscriptionId == _customerSubID
| where ServiceEventName != "VMwareVmDeleteEvent"
| extend obj = todynamic(Message)
| where obj.ObjectType == "Vm" or obj.ObjectType == "Server"
| extend ApplianceName = tostring(obj.ApplianceName), ApplianceDiscAgentId = replace_string(tostring(obj.AgentId),"-agent","")
| extend data = todynamic((tostring(obj.ObjectData)))
| extend 
vcenterName = tostring(data.VCenterId), 
VMName = tostring(data.Name),
Type=tostring(data.FabricElementType),
HostName = tostring(data.HostName),
HostVersion = tostring(data.HostVersion),
VMwareToolsStatus= tostring(data.VMwareToolsStatus),
Firmware= tostring(data.Firmware),
OSName = tostring(data.OSDetails.OSName),
PowerStatus= tostring(data.PowerStatus), 
BIOSGuid= tostring(data.BIOSGuid),
VmFqdn= tostring(data.VmFqdn),
PhysicalFqdn= tostring(data.Fqdn)
| extend FQDN=iff(VmFqdn == "", PhysicalFqdn,VmFqdn)
) on ApplianceName
| summarize arg_max(PreciseTimeStamp, *) by BIOSGuid 
| where VMName contains _VMName
| project PreciseTimeStamp,
ApplianceDiscAgentId,
ApplianceName, 
VMName,
FQDN,
OSName,
Type,
Firmware,
PowerStatus,
BIOSGuid,
VMwareToolsStatus,
vcenterName,
HostName,
HostVersion,
obj
| order by ApplianceName asc, VMName asc
```

---

## 8. V2A/P2A Classic 查询

### 8.1 经典版受保护项目
```kusto
let customerSubID = _customerSubID;
let startTime = _startTime;
let endTime = _endTime;
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').SRSShoeboxEvent 
| where PreciseTimeStamp > _startTime and PreciseTimeStamp < _endTime
| where resourceId has _customerSubID
| extend parsedProperties = parse_json(properties)
| where properties contains _VMName
| order by PreciseTimeStamp asc
```

---

## 9. Resource Mover 查询

### 9.1 移动集合信息
```kusto
RmsMetricEvent
| where MetricName == "RmsTelemetryMoveCollection"
| where SubscriptionId == _customerSubID
| summarize arg_max(PreciseTimeStamp, *) by tostring(MoveCollectionId=Dimensions["CollectionId"])
| project PreciseTimeStamp,
          MoveCollectionId, 
          MoveCollectionName = split(Dimensions["MoveCollectionArmId"], "/", 8)[0], 
          MoveCollectionArmId=Dimensions["MoveCollectionArmId"], 
          SourceRegion=Annotations["SourceRegion"], 
          TargetRegion=Annotations["TargetRegion"],
          Deleted = Annotations["IsDeleted"],
          MoveType= Annotations["MoveType"]
| where Deleted == "False"
| project PreciseTimeStamp, MoveCollectionName, MoveCollectionId, MoveType, MoveCollectionArmId, SourceRegion, TargetRegion
| order by PreciseTimeStamp desc
```

### 9.2 移动资源详情
```kusto
cluster('rmskustomc').database('RMSKustoDB').RmsMetricEvent
| where MetricName == 'RmsTelemetryMoveResource'
| where  SubscriptionId == _customerSubID
| where ResourceId == _movecollectionID
| extend SourceId = split(tostring(Annotations['SourceArmId']), '/')
| extend SourceId = SourceId[-1]
| extend SourceResourceType = replace(@'^.*?/', '', tostring(Annotations['SourceResourceType']))
| project 
         LogTimeStamp = PreciseTimeStamp,
         SubscriptionId,
         SourceId,
         SourceResourceType,
         MoveCollectionId = tostring(Dimensions['CollectionId']),
         MoveResourceId = tostring(Dimensions['MoveResourceGuid']),
         MoveResourceType = tostring(Annotations['MoveResourceType']),
         MoveState = tostring(Annotations['MoveState']),
         ProvisioningState = tostring(Annotations['ProvisioningState']),
         MetadataRegion = tolower(replace(' ', '', Region)),
         IsDeleted = tobool(Annotations['IsDeleted'])
| where IsDeleted == "False"
| summarize arg_max(LogTimeStamp, *) by MoveResourceId
| project TimeStamp=LogTimeStamp, ResourceName=SourceId, ResourceType=SourceResourceType, MoveState, MetadataRegion, MoveResourceId,MoveCollectionId
| order by TimeStamp desc
```

---

## 10. 移动服务URL查询

### 10.1 移动服务下载URL
```kusto
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').PushInstallAgentDiagnosticEvent
| where PreciseTimeStamp > ago(20d)
| where Message contains '"JobType": "DownloadSoftware"' and Message contains "InputPayload"
| extend urls = extract_all(@"(https:\/\/[\w\/\.-]*\.(exe|tar.gz))", Message)
| extend DistroName = extract('DistroName\\\\\\\\\\": \\\\\\\\\\\\\\\"(.*?)\\\\\\\\\\\\\\\"', 1, Message),
  FullVersion = extract('FullVersion\\\\\\\\\\": \\\\\\\\\\\\\\\"(.*?)\\\\\\\\\\\\\\\"', 1, Message)
| where array_length(urls) >= 2
| mv-expand urls[1]
| where strlen(urls_1) > 6
| where DistroName != ""
| distinct DistroName, FullVersion, MobilityService = tostring(urls_1)
| order by DistroName asc, FullVersion asc
```

---

## 11. 堆叠统计查询

### 11.1 按复制提供程序统计
```kusto
cluster('asradxclusmc.chinanorth2.kusto.chinacloudapi.cn').database('ASRKustoDB').SRSShoeboxEvent 
| where PreciseTimeStamp > _startTime and PreciseTimeStamp < _endTime
| where category == "AzureSiteRecoveryReplicatedItems"
| parse resourceId with * "/SUBSCRIPTIONS/" vaultSubscription "/RESOURCEGROUPS" *
| extend vaultSubscription = tolower(vaultSubscription)
| where vaultSubscription == _customerSubID
| extend parsedProperties = parse_json(properties)
| extend Stack=tostring(parsedProperties.replicationProviderName), ReplicatedId = tostring(parsedProperties.correlationId)
| extend Stack = iif(Stack=="InMageAzureV2", Stack="V2A/P2A_Classic", Stack)
| extend Stack = iif(Stack=="InMageRcm", Stack="V2A/P2A_Modernized", Stack)
| extend Stack = iif(Stack contains "HyperV", Stack="Hyper-V", Stack)
| summarize arg_max(PreciseTimeStamp, *) by ReplicatedId
| summarize count() by Stack
```

---

## 12. 页面访问统计查询

### 12.1 通用概览页面访问
```kusto
let pv=cluster('mckusto.chinanorth3.kusto.chinacloudapi.cn').database('kusto').adxpageview| where page == "Caserush-Mooncake-ASR/General Overview";
let pvcount=cluster('mckusto.chinanorth3.kusto.chinacloudapi.cn').database('microsoft').adxpageview | where page == "Caserush-Mooncake-ASR/General Overview";
union pv, pvcount
| order by StartedOn desc
```
