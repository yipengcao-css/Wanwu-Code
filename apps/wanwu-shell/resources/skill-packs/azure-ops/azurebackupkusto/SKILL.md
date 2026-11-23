---
name: "azurebackupkusto"
description: "本文档提供了 Azure Backup 监控和故障排除的 Kusto 查询技能。查询中请使用 Kusto MCP 查询。"
---
# azurebackupkusto查询技能文档




# 常用参数

| 变量 | 说明 | 示例 |
|---|---|---|
| `_subscriptionId` | 订阅 ID | `dad9af98-619d-414b-b917-52a14c0f8756` |
| `_taskId` | 任务 ID | `xxx-xxx-xxx` |
| `_containerName` | 容器/资源名称 | `myVM` |
| `_containerId` | 容器 ID | `xxx-xxx-xxx` |
| `_resourceId` | 资源 ID / Vault ID | `/subscriptions/...` |
| `_dataSourceName` | 数据源名称 | `myDatabase` |
| `_vmName` | 虚拟机名称 | `myVM01` |
| `_diskName` | 磁盘名称 | `myDisk` |
| `_artifactDataSourceId` | Blob/AKS 数据源 ID | `myBlob` |
| `_startTime` | 查询起始时间（UTC） | `2026-05-17T00:00:00Z` |
| `_endTime` | 查询结束时间（UTC） | `2026-05-17T08:30:00Z` |


## Kusto 集群连接信息

- **备份集群**: `https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn.kusto.chinacloudapi.cn`
- **数据库**: `MABKustoProd`

- **备份集群**: `https://mckusto.chinanorth3.kusto.chinacloudapi.cn`
- **数据库**: `kusto`
- **数据库**: `microsoft`


## 执行流程（token 预检 → MCP 优先 → 脚本兜底）

**0. 预检 token（每次任务首次查询前，只查一个集群）**

```powershell
python $WANWU_SKILLS_ROOT/_shared/get_kusto_token.py https://mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn
```

- 输出 `code: 0` → 登录有效，继续；**顺手留着这个 token 给第 2 步兜底复用**。
- 输出 `code: 1` → **立即终止，不做任何查询**；直接告诉用户：**Azure CLI 登录已失效，请重新 `az login`**，登录完再让我重试。
- 只查**一个**集群即可：az 登录缓存是全局的，一个能过 → 全部能过。

**1. 建查询**：从 # 查询方法 选取查询的集群，数据库和表 。

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


## 需要遵守的建议
  - 下面列出的查询表是必须要查询到的表
  - 查询完成给出分析结果后，必须给出你使用的kusto查询语句以及分析到的关键日志，用于证明分析结论
  - 下面列出的表，不是数据库中所有的表，如果没有查询到结果，请查询数据库中尽可能多的表，查询表的结构，并分析是否与查询的主题相关，如果相关，则需要查询对应表的日志
  - 全程保持客观、专业，不编造数据


# 查询方法

## 1. SQL Backup 查询

### 1.1 SQL Backup Plugin跟踪 [TaskID]

用于跟踪特定任务的SQL备份插件日志。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').WBETraceLog   
| where TaskId  ==  _taskId
| where TIMESTAMP > _startTime
| project PreciseTimeStamp, Message, Exception, Properties, Level, RequestId, ServiceName
| order by PreciseTimeStamp asc
```

### 1.2 SQL Backup概览 [SubscriptionID]

获取SQL备份操作的总体概览，包括性能指标和错误分析。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').WBEBackupStats
| where SubscriptionId == _subscriptionId
| where ContainerName contains _containerName
| where DatasourceName contains _dataSourceName
| where TIMESTAMP > _startTime
| extend ComponentData = parse_json(ComponentDurationsInMS)
| extend Duration= DurationInMS/60000 //(DurationInMS/3600000 to hours)
| extend DSTransferGB = todouble(DataTransferred) /(1024*1024*1024)
| extend ReadThroughputInMBps = parse_json(Properties).OverallReadThroughputInMBps
| extend WriteThroughputInMBps = parse_json(Properties).OverallWriteThroughputInMBps
| extend BkpQueueWaitMin = parse_json(ComponentData.BackupQueueWait)/1000/60283
| extend PreBackupSec = parse_json(ComponentData.PreBackup)/1000
| extend PostBackupMin = parse_json(ComponentData.PostBackup)/1000/60
| extend BackupId = parse_json(Properties).BackupId
| extend InternalError = parse_json(Properties).InternalErrorCode
| extend DetailedError = parse_json(Properties).AdditionalErrorDetails
| extend ResourceId = tostring(ResourceId) 
| extend ContainerId = tostring(ContainerId) 
| extend LogicalContainerId = tostring(LogicalContainerId) 
| extend DatasourceId = tostring(DatasourceId) 
| project  StartTime, PreciseTimeStamp,ResourceId, ContainerName, MachineName, ContainerId, LogicalContainerId, DatasourceId, DatasourceName, Duration, TaskId, BackupType, ErrorCode,  BackupId,DSTransferGB, DatasourceSize,InternalError, DetailedError, BkpQueueWaitMin,PreBackupSec, PostBackupMin, ReadThroughputInMBps,WriteThroughputInMBps, ProcessVersion, SourceVersion
| sort by StartTime desc
```

### 1.3 SQL Restore概览 [SubscriptionID]

监控SQL数据库恢复操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').WBERecoveryStats
| where SubscriptionId == _subscriptionId
| where tolower(DatasourceType) == tolower("Sqldatabase")
| where DatasourceName contains _dataSourceName
| where TIMESTAMP > _startTime
| extend ComponentData = parse_json(ComponentDurationsInMS)
| extend Duration= DurationInMS/60000 //(DurationInMS/3600000 to hours)
| extend DSTransferGB = todouble(DataTransferred) /(1024*1024*1024)
| extend ReadThroughputInMBps = parse_json(Properties).OverallReadThroughputInMBps
| extend WriteThroughputInMBps = parse_json(Properties).OverallWriteThroughputInMBps
| extend BkpQueueWaitMin = parse_json(ComponentData.BackupQueueWait)/1000/60283
| extend PreBackupSec = parse_json(ComponentData.PreBackup)/1000
| extend PostBackupMin = parse_json(ComponentData.PostBackup)/1000/60
| extend BackupId = parse_json(Properties).BackupId
| extend InternalError = parse_json(Properties).InternalErrorCode
| extend DetailedError = parse_json(Properties).AdditionalErrorDetails
| extend ResourceId = tostring(ResourceId) 
| extend ContainerId = tostring(ContainerId) 
| extend LogicalContainerId = tostring(LogicalContainerId) 
| extend DatasourceId = tostring(DatasourceId) 
| project  StartTime, PreciseTimeStamp,ResourceId, ContainerName, MachineName, ContainerId,LogicalContainerId, DatasourceId, DatasourceName, Duration, TaskId, ErrorCode,OperationName,RecoveryType, DSTransferGB,InternalError, DetailedError, ProcessVersion, SourceVersion
| sort by StartTime desc
```

## 2. IaaS VM Backup查询

### 2.1 IaaS VM Backup概览 [SubscriptionID]

监控Azure虚拟机备份状态。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').BCMBackupStats 
| where SubscriptionId contains _subscriptionId
| where TIMESTAMP > _startTime
| where VMName contains _vmName 
| extend BackupTimeInHours = BackupTimeInMins/60
| extend QueueTimeInMin = BackupQueueTimeInMilliSec/60000
| extend DiffCopyTimeInMin =  DiffCopyTimeInMilliSec/60000
| extend TotalSnapshotTimeInMin =  TotalSnapshotTimeInMilliSec/60000
| extend DeltaSizeInGB = (DeltaSizeInMB/1024)
| extend TotalDurationInMin = DurationInMilliSec/60000
| extend BackupQueueTimeInHours =  BackupQueueTimeInMilliSec/3600/1000
| project StartTime, TIMESTAMP, TaskId, VMName, OSVersion, VmLocation , ErrorCode,IsScheduledBackup, ExtensionErrorCode, ExtensionStatus, ExtensionStatusBlobMsg, ExtensionTelemetry, SnapshotType, IsVMOffline, IsEncrypted, JobStatus, BackupQueueTimeInHours, BackupTimeInHours, DeltaSizeInGB, TotalSnapshotTimeInMin, NumberOfDisks,NumberOfDiskAdded, FailedWriters, RecoveryPointId, GuestAgentVersion, GuestAgentInfo, DataSourceId, ResourceId, BackupPolicyId, SizeOfVm
| order by TIMESTAMP desc
```

### 2.2 IaaS VM Restore概览 [SubscriptionID]

监控虚拟机恢复操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').BCMRecoveryStats
| where SubscriptionId == _subscriptionId
| where StartTime > _startTime
| where ContainerName contains _vmName 
| project StartTime, TIMESTAMP, ContainerName, ErrorCode, JobStatus, RecoveryType, OperationName,IsInstantTierPresent, RestoreTierType, TaskId, TargetVmContainerName, RecoveryPointId, NumberOfDisks
|order by StartTime desc nulls last
```

### 2.3 IaaS VM Disk进度监控 [Tier 2 only]

监控虚拟机磁盘备份进度。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').TraceLogMessage
| where PreciseTimeStamp > _startTime
| where TaskId == _taskId
| where Message contains "Percentage Done ="
| extend DiskName = extract(@'\{DiskName = ([^\}]+)\}', 1, Message),
         PercentageDone = toint(extract(@'\{Percentage Done = ([^\}]+)\}', 1, Message)),
         Timestamp = PreciseTimeStamp
| where isnotempty(DiskName) and isnotempty(PercentageDone)
| project Timestamp, DiskName, PercentageDone
| order by Timestamp asc
```

## 3. SAP HANA Backup查询

### 3.1 SAP HANA Backup概览 [SubscriptionID]

监控SAP HANA数据库备份操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').WBEBackupStats 
| where SubscriptionId == _subscriptionId 
| where StartTime >= _startTime
| where ContainerName contains _containerName
| where DatasourceName contains _dataSourceName
| where DatasourceType contains "SAPHana"
| extend  TimeInMin = DurationInMS /60/1000
| extend  TimeInHours = DurationInMS /3600/1000
| extend  DataTransferredinGB = DataTransferred /1000000000
| extend  DataTransferredinMB = DataTransferred /1000000
| extend BackupSpeedAchievedIncludingExtensionDelaysInMbps = (todouble(DataTransferred)/(todouble(DurationInMS)/1000)/(1024 * 1024))
| extend countBruUnits =tolong(parse_json(Properties).CountOfBRUUnits) , countBRUReplicas = tolong(parse_json(Properties).CountOfBRUReplicas)
| extend ExpectedMaxBackupSpeedWithoutCap = countBRUReplicas*(countBruUnits/2)
| extend ExpectedMaxBackupSpeed = iff(ExpectedMaxBackupSpeedWithoutCap > 450, 450, ExpectedMaxBackupSpeedWithoutCap)
| extend AdditionalErrorDetails = extractjson("$.AdditionalErrorDetails", Properties)
| extend result_json = parse_json(Properties)
| extend InternalErrorCode = result_json.InternalErrorCode
| extend AdditionalErrorDetails = result_json.AdditionalErrorDetails
| extend BackupId = result_json.BackupId
| extend IsAdhoc = result_json.IsAdhoc
| extend ResourceId = tostring(ResourceId) 
| extend DatasourceId = tostring(DatasourceId)
| extend ContainerId = tostring(ContainerId) 
| extend LogicalContainerId = tostring(LogicalContainerId) 
| project  PreciseTimeStamp, StartTime, MachineName, ContainerName,ContainerId, LogicalContainerId, DatasourceName, BackupType, ErrorCode, DatasourceId, ExpectedMaxBackupSpeed, BackupSpeedAchievedIncludingExtensionDelaysInMbps,TimeInMin, TimeInHours, DataTransferredinMB, DataTransferredinGB , IsAdhoc, BackupId, AdditionalErrorDetails, TaskId, ResourceId, Properties, DeploymentName, PluginProperties
| order by PreciseTimeStamp desc nulls last
```

### 3.2 SAP HANA Restore概览 [SubscriptionID]

监控SAP HANA数据库恢复操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').WBERecoveryStats 
| where SubscriptionId == _subscriptionId 
| where StartTime >= _startTime
| where ContainerName contains _containerName
| where DatasourceName contains _dataSourceName
| where tolower(DatasourceType) == tolower("SAPHanaDatabase")
| extend Duration= DurationInMS/60000 //(DurationInMS/3600000 to hours)
| extend DSTransferGB = todouble(DataTransferred) /(1024*1024*1024)
| extend result_json = parse_json(Properties)
| extend ComponentData = parse_json(ComponentDurationsInMS)
| extend ReadThroughputInMBps = parse_json(Properties).OverallReadThroughputInMBps
| extend InternalErrorCode = result_json.InternalErrorCode
| extend AdditionalErrorDetails = result_json.AdditionalErrorDetails
| extend WriteThroughputInMBps = parse_json(Properties).OverallWriteThroughputInMBps
| extend BkpQueueWaitMin = parse_json(ComponentData.BackupQueueWait)/1000/60283
| extend PreBackupSec = parse_json(ComponentData.PreBackup)/1000
| extend PostBackupMin = parse_json(ComponentData.PostBackup)/1000/60
| extend BackupId = result_json.BackupId
| extend IsAdhoc = result_json.IsAdhoc
| extend ResourceId = tostring(ResourceId) 
| extend DatasourceId = tostring(DatasourceId)
| extend ContainerId = tostring(ContainerId) 
| extend LogicalContainerId = tostring(LogicalContainerId) 
| project StartTime ,TimeStamp, TaskId, MachineName ,ContainerName, DatasourceName, ResourceId, ContainerId, LogicalContainerId, DatasourceId, DSTransferGB, Duration, ErrorCode,InternalErrorCode, ReadThroughputInMBps, WriteThroughputInMBps, AdditionalErrorDetails, ProcessVersion
```

## 4. MARS Backup查询

### 4.1 MARS Backup概览 [VaultID]

监控MARS (Microsoft Azure Recovery Services) 代理备份。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').CBPBackupStats
| where ResourceId == _resourceId
| where PreciseTimeStamp > _startTime
| where tostring(ContainerId) contains tostring(_containerId)
| where AgentType == "OBS" 
| extend DataTransferedInMb = DataTransferedInBytes / 1048576  // Convert bytes to MB
| extend DataTransferedInGb = DataTransferedInBytes / 1073741824  // Convert bytes to GB
| extend SourceDataSizeInMb = SourceDataSizeinBytes / 1048576  // Convert bytes to MB
| extend SourceDataSizeInGb = SourceDataSizeinBytes / 1073741824  // Convert bytes to GB
| extend TotalBackupDurationInMinutes = TotalBackupDurationInSeconds / 60
| extend TotalBackupDurationInHours = TotalBackupDurationInMinutes / 60
| extend DurationHours = tostring(toint(TotalBackupDurationInHours))
| extend DurationMinutes = tostring(toint(TotalBackupDurationInMinutes % 60))
| extend BackupDuration = strcat(DurationHours, 'h ', DurationMinutes, 'm')  // Format duration string
| extend ResourceId = tostring(ResourceId) 
| extend DataSourceId = tostring(DataSourceId)
| extend ContainerId = tostring(ContainerId)
| extend TaskId = tostring(TaskId)
| extend  VaultID = ResourceId
| project PreciseTimeStamp, TaskId, VaultID, ResourceId, ContainerId, DataSourceId, ErrorCode, CBPVersion, DataTransferedInBytes, DataTransferedInMb, DataTransferedInGb, SourceDataSizeinBytes, SourceDataSizeInMb, SourceDataSizeInGb, TotalBackupDurationInMinutes, BackupDuration, IsIR, IsRetriedJob, ChurnPercentage, Warnings
| order by PreciseTimeStamp desc
```

### 4.2 MARS CBengine跟踪 [TaskID]

监控MARS备份引擎的详细跟踪。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').CBPTraceMessages
| where TaskId == _taskId
| order by TIMESTAMP asc
| project PreciseTimeStamp, Message, TaskId, FileNameLineNumber,ServiceName, Level
```

### 4.3 MARS Restore概览 [VaultID]

监控MARS恢复操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').CBPRecoveryStats
| where ResourceId == _resourceId
| where PreciseTimeStamp > _startTime
| where tostring(ContainerId) contains tostring(_containerId)
| where AgentType == "OBS" 
| extend DataTransferedInMb = DataTransferedInBytes / 1048576  // Convert bytes to MB
| extend DataTransferedInGb = DataTransferedInBytes / 1073741824  // Convert bytes to GB
| extend DownloadDurationInMinutes = DownloadDurationInSeconds / 60
| extend DownloadDurationInHours = DownloadDurationInMinutes / 60
| extend DurationHours = tostring(toint(DownloadDurationInHours))
| extend DurationMinutes = tostring(toint(DownloadDurationInMinutes % 60))
| extend DownloadDurationFormatted = strcat(DurationHours, 'h ', DurationMinutes, 'm')  // Format duration string
| extend ResourceId = tostring(ResourceId) 
| extend DataSourceId = tostring(DataSourceId)
| extend ContainerId = tostring(ContainerId)
| extend TaskId = tostring(TaskId)
| extend VaultID = ResourceId
| project PreciseTimeStamp, TIMESTAMP, OperationStartTime, VaultID, ResourceId, DataSourceId, ContainerId, TaskId, DataTransferedInBytes, DataTransferedInMb, DataTransferedInGb, DownloadDurationInSeconds, DownloadDurationInMinutes, DownloadDurationFormatted, CBPVersion, DeploymentName
| order by TIMESTAMP desc
```

## 5. Azure Disk Backup查询

### 5.1 Azure Disk Backup概览 [SubscriptionID]

监控Azure磁盘备份操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').DiskBackupStats
| where TIMESTAMP > _startTime
| where SubscriptionId == _subscriptionId
| where DiskName contains _diskName
| project PreciseTimeStamp, StartTime, TaskId, OperationName, ErrorCode, SubscriptionId, IsScheduledBackup, BackupInstanceId, DiskName, DiskRegion=Region, DiskUniqueId, RPId, DurationInSeconds, SnapshotRG, SnapshotURI, DataSourceId, PolicyName, RequestId, PitMgrSessionId, DeploymentName
| order by StartTime desc
```

### 5.2 Azure Disk Backup跟踪 [TaskID]

跟踪特定磁盘备份任务的详细信息。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').TraceLogMessage 
| where TIMESTAMP > _startTime
| where TaskId == _taskId
| project PreciseTimeStamp, ServiceName, FileNameLineNumber, Message, Level=Level+1 
```

### 5.3 Azure Disk Restore概览 [SubscriptionID]

监控Azure磁盘恢复操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').DiskRecoveryStats
| where TIMESTAMP > _startTime
| where SubscriptionId == _subscriptionId
| where SourceDiskName contains _diskName
| project PreciseTimeStamp, StartTime, TaskId, OperationName, ErrorCode, SubscriptionId, BackupInstanceId, SourceDiskName, SourceDiskRegion=Region, DiskUniqueId, TargetSubscription, TargetDiskName, TargetResourceID, RecoveryTier, RecoveryType, DurationInSeconds, SnapshotRG, SnapshotURI, DataSourceId, RequestId, DeploymentName
| order by StartTime desc
```

## 6. Azure File Share Backup查询

### 6.1 AFS Backup概览 [SubscriptionID]

监控Azure文件共享备份操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').CWESBackupStats
| where SubscriptionId == _subscriptionId
| where TIMESTAMP > _startTime
| where ContainerName contains _containerName
| where BackupProvider contains "AzureStorage_AFS"
| extend DurationHours = DurationInMilliSec / 3600000.0
| extend DurationMinutes = DurationInMilliSec / 60000.0
| extend BackupDuration = strcat(tostring(toint(DurationHours)), 'h ', tostring(toint(DurationMinutes % 60)), 'm')
| project TIMESTAMP, ContainerName, FileShareName=POFriendlyName, ResourceId, POUniqueName, POType, ErrorCode,IsAdhoc, TaskId, OperationName, BackupDuration, toint( DurationMinutes),DurationInMilliSec
| order by TIMESTAMP desc
```

### 6.2 Azure File Share Backup跟踪 [TaskID]

跟踪Azure文件共享备份的详细日志。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').TraceLogMessage 
| where TIMESTAMP > _startTime
| where TaskId == _taskId
| project PreciseTimeStamp, ServiceName, FileNameLineNumber, Message, Level=Level+1 
```

### 6.3 Azure File Share Restore概览 [SubscriptionID]

监控Azure文件共享恢复操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').CWESRecoveryStats
| where SubscriptionId == _subscriptionId
| where TIMESTAMP > _startTime
| where BackupProvider contains "AzureStorage_AFS"
| project StartTime, RestoreType, CopyOption, BytesTransferred, FileshareName=POFriendlyName, ErrorCode,NumberOfFilesRecovered, ContainerName, TaskId,  ResourceId, OperationName
| order by StartTime desc nulls last
```

## 7. PostgreSQL Backup查询

### 7.1 PostgreSQL Backup概览 [SubscriptionID]

监控PostgreSQL数据库备份操作。

```kusto
//To check operations
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').OperationStatsLocal
| where TIMESTAMP > _startTime
|where BackupProvider  contains "Microsoft.DBforPostgreSQL/flexibleServers"// Provider name
| where SubscriptionId  contains _subscriptionId
| where OperationName in ("BackupAgentScheduledBackupWorkflow", "BackupAgentAdhocBackupWorkflow") // Operation Name provided above to be 
| project TIMESTAMP, TaskId,BackupInstanceId, OperationName,BackupProvider, ErrorCode, AdditionalDetails 
```

### 7.2 PostgreSQL Backup跟踪 [TaskID]

跟踪PostgreSQL备份任务的详细日志。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').TraceLogMessage 
| where TIMESTAMP > _startTime
| where TaskId == _taskId
| project TIMESTAMP, DeploymentName, ServiceName, Role, Message, FileNameLineNumber, TaskId, Level 
```

### 7.3 PostgreSQL Restore概览 [SubscriptionID]

监控PostgreSQL恢复操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').OperationStatsLocal
| where TIMESTAMP > _startTime
|where BackupProvider  contains "Microsoft.DBforPostgreSQL/flexibleServers"// Provider name
| where SubscriptionId  contains _subscriptionId
| where OperationName in ("BackupAgentRestoreWorkflow") // Operation Name provided above to be 
| project TIMESTAMP, TaskId,BackupInstanceId, OperationName,BackupProvider, ErrorCode, AdditionalDetails 
```

## 8. Azure Blob Backup查询

### 8.1 Azure Blob Backup概览 [SubscriptionID]

监控Azure Blob存储备份操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').ActivityStats
| where TIMESTAMP > _startTime
| where Artifact_BackupProvider == "Microsoft.Storage/storageAccounts/blobServices"
| where Artifact_SubscriptionId == _subscriptionId
| where Artifact_DataSourceId contains _artifactDataSourceId
| where ActivityName in ("Backup") 
| extend result_json = parse_json(ErrorDetails)
| extend ErrorCode = result_json.ErrorCode
| extend ErrorMsg = result_json.Message
| extend ErrorMsgDetails = result_json.ErrorDetails
| project StartTime, EndTime, Instance_TaskId, Artifact_DataSourceId, ActivityType,ActivityName, ErrorCode, ErrorMsg,ErrorMsgDetails, Input
| order by StartTime asc
```

### 8.2 Blob Backup跟踪 [TaskID]

跟踪Blob备份任务的详细日志。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').TraceLogMessage 
| where TIMESTAMP > _startTime
| where TaskId == _taskId
| project TIMESTAMP, ServiceName, Message, FileNameLineNumber, Level, Pid
```

### 8.3 Azure Blob Restore概览 [SubscriptionID]

监控Azure Blob恢复操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').ActivityStats
| where Artifact_SubscriptionId == _subscriptionId
| where TIMESTAMP > _startTime
| where Artifact_DataSourceId contains _artifactDataSourceId
| where Artifact_BackupProvider == "Microsoft.Storage/storageAccounts/blobServices"
//| where ActivityType contains "Restore"
| where ActivityName in ("Restore")
| extend result_json = parse_json(ErrorDetails)
| extend ErrorCode = result_json.ErrorCode
| extend ErrorMsg = result_json.Message
| extend ErrorMsgDetails = result_json.ErrorDetails
| project StartTime, EndTime, Instance_TaskId, Artifact_DataSourceId, ActivityType,ActivityName, ErrorCode, ErrorMsg,ErrorMsgDetails, Input, Artifact_SubscriptionId
| order by StartTime desc 
```

### 8.4 Blob操作跟踪 [SubscriptionID]

监控Blob相关的所有操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').ActivityStats
| where TIMESTAMP > _startTime
| where Artifact_BackupProvider contains "Microsoft.Storage/storageAccounts/blobServices"
| where Artifact_SubscriptionId contains _subscriptionId
//|where Artifact_DataSourceId contains "sisprdblobstgh1"
//| where ServiceName == "backupcs"
| extend result_json = parse_json(ErrorDetails)
| extend ErrorCode = result_json.ErrorCode
| extend ErrorMsg = result_json.Message
| extend ErrorMsgDetails = result_json.ErrorDetails
| project StartTime, EndTime,Artifact_DataSourceId, ActivityType, ErrorCode,ErrorMsg,ErrorMsgDetails, Instance_TaskId
```

## 9. AKS Backup查询

### 9.1 AKS Backup概览 [SubscriptionID]

监控Azure Kubernetes Service集群备份。

```kusto
//To check operations
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').ActivityStats
| where TIMESTAMP > _startTime
| where Artifact_BackupProvider == "Microsoft.ContainerService/managedClusters"
| where Artifact_SubscriptionId == _subscriptionId
| where Artifact_DataSourceId contains _artifactDataSourceId
| where ActivityName in ("Backup") 
| extend result_json = parse_json(ErrorDetails)
| extend ErrorCode = result_json.ErrorCode
| extend ErrorMsg = result_json.Message
| extend ErrorMsgDetails = result_json.ErrorDetails
| project StartTime, EndTime, Instance_TaskId, Artifact_DataSourceId, ActivityType,ActivityName, ErrorCode, ErrorMsg,ErrorMsgDetails, Input
| order by StartTime asc
```

### 9.2 AKS Backup跟踪 [TaskID]

跟踪AKS备份任务的详细日志。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').TraceLogMessage 
| where TIMESTAMP > _startTime
| where TaskId == _taskId
| project TIMESTAMP, DeploymentName, ServiceName, Role, Message, FileNameLineNumber, TaskId, Level
```

### 9.3 AKS Restore概览 [SubscriptionID]

监控AKS集群恢复操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').ActivityStats
| where Artifact_SubscriptionId == _subscriptionId
| where TIMESTAMP > _startTime
| where Artifact_DataSourceId contains _artifactDataSourceId
| where Artifact_BackupProvider == "Microsoft.ContainerService/managedClusters"
//| where ActivityType contains "Restore"
| where ActivityName in ("Restore")
| extend result_json = parse_json(ErrorDetails)
| extend ErrorCode = result_json.ErrorCode
| extend ErrorMsg = result_json.Message
| extend ErrorMsgDetails = result_json.ErrorDetails
| project StartTime, EndTime, Instance_TaskId, Artifact_DataSourceId, ActivityType,ActivityName, ErrorCode, ErrorMsg,ErrorMsgDetails, Input, Artifact_SubscriptionId
| order by StartTime desc 
```

## 10. 保管库库使用情况查询

### 10.1 平均使用情况按保险库ID [SubscriptionID]

分析保险库存储使用情况。

```kusto
let distinctResourceIds = 
    cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').ContainerUsageStats
    | where TIMESTAMP >= startofday(now())
    | where SubscriptionId == _subscriptionId
    | where (_resourceId == "" or ResourceId == _resourceId)
    | distinct ResourceId;  
let storageUsage =
        cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').ProtectionBillingStats
    | where TIMESTAMP >= startofday(now())
    | where CompanyId in (distinctResourceIds)
    | where DsId != 0
    | where SizeOf == "Ds" and Type == "Storage" and OperationType == "Daily"
    | where MetricType !in ("ArchiveGeoRedundantStorage", "ArchiveLocallyRedundantStorage")
    | project TIMESTAMP, StampName, MachineId, DsId, CompanyId, StorageInGB = Size/(1024*1024*1024), StorageType, MetricType, ContainerUniqueName, DsUniqueName
    | extend containerName = tostring(split(DsUniqueName, "<>")[1])
    | summarize arg_max(TIMESTAMP, *) by bin(TIMESTAMP, 1d), DsId
    | distinct TIMESTAMP, containerName, tostring(DsId), StorageInGB, StampName, CompanyId
    | summarize Total_StorageInGB = sum(StorageInGB) by bin(TIMESTAMP, 1d), CompanyId
    | extend Total_StorageInTB = Total_StorageInGB / 1024;    
distinctResourceIds
| join kind=leftouter (storageUsage) on $left.ResourceId == $right.CompanyId
| extend Total_StorageInGB = coalesce(Total_StorageInGB, 0)
| extend Total_StorageInTB = coalesce(Total_StorageInTB, 0)
| project  ResourceId=tostring(ResourceId), Total_StorageInGB, Total_StorageInTB
| order by Total_StorageInGB desc 
```

### 10.2 保管库存储消耗按DSType [SubscriptionID]

按数据源类型分析存储消耗。

```kusto
let distinctResourceIds = 
        cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').ContainerUsageStats
    | where TIMESTAMP >= startofday(now())
    | where SubscriptionId == _subscriptionId
    | where (_resourceId == "" or ResourceId == _resourceId)
    | distinct ResourceId;  
let protectionBilling = 
    cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').ProtectionBillingStats
    | where TIMESTAMP >= startofday(now())
    | where CompanyId in (distinctResourceIds)
    | where DsId != 0
    | where SizeOf == "Ds" and Type == "Storage" and OperationType == "Daily" //and DsType == "IaaSVM"
    | where MetricType !in ("ArchiveGeoRedundantStorage", "ArchiveLocallyRedundantStorage")
    | summarize arg_max(TIMESTAMP, *) by DsId
    | project TIMESTAMP, StampName, MachineId, DsId, CompanyId, StorageInGb = Size/(1024*1024*1024), StorageType, MetricType, ContainerUniqueName, DsUniqueName, DsType
    | extend DSName = tostring(split(tostring(split(DsUniqueName, "<>")[1]), ";")[2])
    | project TIMESTAMP, StampName, DSName, MachineId, DsType, DataSourceId=tostring(DsId), StorageInGb, ResourceId = CompanyId;
protectionBilling
| summarize Total_StorageInGb = sum(StorageInGb) by ResourceId, DsType
| extend Total_StorageInTb = Total_StorageInGb / 1024
| order by Total_StorageInTb desc
| project DsType, ResourceId=tostring(ResourceId),  Total_StorageInGb, Total_StorageInTb
```

### 10.3 保管库中存在的数据源 [VaultID]

列出特定保险库中的所有数据源。

```kusto
let protectionBilling = 
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').ProtectionBillingStats
| where TIMESTAMP between (_startTime .. _endTime)
| where CompanyId == _resourceId
| where DsId != 0
| where SizeOf == "Ds" and Type == "Storage" and OperationType == "Daily" //and DsType == "IaaSVM"
| where MetricType !in ("ArchiveGeoRedundantStorage", "ArchiveLocallyRedundantStorage")
| extend MachineId = tostring(MachineId) 
| summarize arg_max(TIMESTAMP, *) by DsId
| project TIMESTAMP, StampName, MachineId,DsId, CompanyId, StorageInTb = Size/(1024.0*1024*1024*1024), StorageType, MetricType, ContainerUniqueName, DsUniqueName, DsType
| extend DSName = tostring(split(tostring(split(DsUniqueName, "<>")[1]), ";")[2])
| project TIMESTAMP, StampName, DSName, MachineId, DsType, DataSourceId=tostring(DsId), StorageInTb;
protectionBilling
| order by StorageInTb
```

## 11. DPM/MABS查询

### 11.1 注册作业 [SubscriptionID]

监控DPM/MABS服务器注册。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').BMSRegistrationStats    
| where SubscriptionId == _subscriptionId
| where PreciseTimeStamp > _startTime
| where AgentType contains "DPM" 
| distinct TIMESTAMP, VaultID=ResourceId, ContainerId, ContainerName,OperationName, ErrorCode, AgentType, TaskId
| order by TIMESTAMP desc
```

### 11.2 备份概览 [VaultID]

监控DPM/MABS备份操作。

```kusto
cluster('mabprodmcadx.chinaeast2.kusto.chinacloudapi.cn').database('MABKustoProd').CBPBackupStats
| where ResourceId == _resourceId
| where PreciseTimeStamp > _startTime
| where tostring(ContainerId) contains tostring(_containerId)
| where AgentType contains "DPM" 
| extend DataTransferedInMb = DataTransferedInBytes / 1048576  // Convert bytes to MB
| extend DataTransferedInGb = DataTransferedInBytes / 1073741824  // Convert bytes to GB
| extend SourceDataSizeInMb = SourceDataSizeinBytes / 1048576  // Convert bytes to MB
| extend SourceDataSizeInGb = SourceDataSizeinBytes / 1073741824  // Convert bytes to GB
| extend TotalBackupDurationInMinutes = TotalBackupDurationInSeconds / 60
| extend TotalBackupDurationInHours = TotalBackupDurationInMinutes / 60
| extend DurationHours = tostring(toint(TotalBackupDurationInHours))
| extend DurationMinutes = tostring(toint(TotalBackupDurationInMinutes % 60))
| extend BackupDuration = strcat(DurationHours, 'h ', DurationMinutes, 'm')  // Format duration string
| extend ResourceId = tostring(ResourceId) 
| extend DataSourceId = tostring(DataSourceId)
| extend ContainerId = tostring(ContainerId)
| extend TaskId = tostring(TaskId)
| extend  VaultID = ResourceId
| project PreciseTimeStamp, TaskId, VaultID, ContainerId, DataSourceId, ErrorCode,CBPVersion, DataTransferedInBytes, DataTransferedInMb, DataTransferedInGb, SourceDataSizeinBytes, SourceDataSizeInMb, SourceDataSizeInGb, TotalBackupDurationInMinutes, BackupDuration, IsIR, IsRetriedJob, ChurnPercentage, Warnings
| order by PreciseTimeStamp desc
```