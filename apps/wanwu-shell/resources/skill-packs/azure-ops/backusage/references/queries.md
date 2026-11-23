# AzureBackupReportingData — 查询参考

## 表结构（关键列）

`AzureBackupReportingData` 主要列：

| 列 | 类型 | 说明 |
|---|---|---|
| `PreciseTimeStamp` | datetime | 采样时间（UTC+0），查询时间过滤用这一列 |
| `TIMESTAMP` | datetime | 同上（另一个时间列） |
| `resourceId` | string | 大写全路径：`/SUBSCRIPTIONS/<subId>/RESOURCEGROUPS/<rg>/PROVIDERS/MICROSOFT.RECOVERYSERVICES/VAULTS/<vaultName>` |
| `properties` | string | JSON **字符串**，承载备份项、存储等明细 |
| `operationName` | string | 存储相关为 `StorageAssociation` |
| `category` | string | 存储采样会同时出现在 `AzureBackupReport` 和 `AddonAzureBackupStorage`（镜像） |

### `properties`（JSON）里的关键字段

| 字段 | 说明 |
|---|---|
| `StorageConsumedInMBs` | 备份项消耗的备份存储（**字符串**，单位 MB）——核心指标 |
| `ArchiveTierStorageConsumedInMBs` | 归档层用量，通常 `"0"` |
| `StorageAllocatedInMBs` | 偶发出现的分配值，一般不用 |
| `BackupItemUniqueId` | 备份项唯一 ID；`;` 分隔，末段是项名（VM/DB 名） |
| `ProtectedContainerUniqueId` | 受保护容器 ID |
| `VaultUniqueId` | 保管库 ID（`region;subId`），**与 resourceId 路径不同，勿混用** |
| `BackupManagementType` | `AzureWorkload` / `AzureBackupServer` / `IaasVM` 等 |
| `State` | 通常 `Active` |

> **数据语义**：`StorageConsumedInMBs` 是**存量 gauge**，一天内有多个采样批次，值在基线↔峰值间波动
> （备份/恢复点生成时抬升）。因此"每天一个值"本身是近似；**口径统一取近期窗口的均值**。

结构自探测见文件末尾。

---

## 模板 1（主用）：保管库近期平均用量

口径 = 最近 24 小时均值，与 Azure 门户一致。

```kql
AzureBackupReportingData
| where PreciseTimeStamp > ago(1d)                    // 近期窗口；可按需改 ago(7d)/ago(30d)
| where resourceId contains "SRV"                     // 保管库名/ID，contains 大小写不敏感
| where properties has "StorageConsumedInMBs"
| where isnotnull(PreciseTimeStamp)
| where category == "AzureBackupReport"               // 去镜像 category
| extend p = parse_json(properties)
| extend item = tostring(p.BackupItemUniqueId),
         mb   = toreal(tostring(p.StorageConsumedInMBs))
| summarize AvgMB = avg(mb), Samples = count() by item
| summarize Items = count(), StorageMB = sum(AvgMB)   // 汇总为整库用量
```

## 模板 2：按备份项分解（定位大户）

```kql
AzureBackupReportingData
| where PreciseTimeStamp > ago(1d)
| where resourceId contains "SRV"
| where properties has "StorageConsumedInMBs"
| where isnotnull(PreciseTimeStamp)
| where category == "AzureBackupReport"
| extend p = parse_json(properties)
| extend item = tostring(p.BackupItemUniqueId),
         mb   = toreal(tostring(p.StorageConsumedInMBs)),
         mt   = tostring(p.BackupManagementType)
| summarize AvgMB = avg(mb) by item, mt
| order by AvgMB desc
```

## 模板 3：每日趋势

```kql
AzureBackupReportingData
| where PreciseTimeStamp between (datetime(_start) .. datetime(_end))
| where resourceId contains "SRV"
| where properties has "StorageConsumedInMBs"
| where isnotnull(PreciseTimeStamp)
| where category == "AzureBackupReport"
| extend p = parse_json(properties)
| extend item = tostring(p.BackupItemUniqueId),
         mb   = toreal(tostring(p.StorageConsumedInMBs))
| summarize DayAvgMB = avg(mb) by ds = startofday(PreciseTimeStamp), item
| summarize Items = count(), DailyStorageMB = sum(DayAvgMB) by ds
| order by ds asc
```

---

## 结构自探测（表不明时先跑）

**1) 看采样分布 / 是否镜像 category：**

```kql
AzureBackupReportingData
| where PreciseTimeStamp > ago(1d)
| where resourceId contains "SRV"
| where properties has "StorageConsumedInMBs"
| summarize Rows = count(), Items = dcount(tostring(parse_json(properties).BackupItemUniqueId)) by category
```
若两个 category 行数相等 → 是镜像，按 `category == "AzureBackupReport"` 去重。

**2) 看单项原始时序（确认是 gauge 波动还是每日一条）：**

```kql
AzureBackupReportingData
| where PreciseTimeStamp between (datetime(_start) .. datetime(_end))
| where resourceId contains "SRV"
| where properties has "StorageConsumedInMBs"
| where category == "AzureBackupReport"
| extend p = parse_json(properties)
| extend item = tostring(split(tostring(p.BackupItemUniqueId), ";")[-1]),
         mb   = toreal(tostring(p.StorageConsumedInMBs))
| project PreciseTimeStamp, item, mb
| order by PreciseTimeStamp asc
```

**3) 找表/结构：** `kusto-mcp__show-tables`、`kusto-mcp__show-table("<name>")`。
其他可能相关的表：`ContainerUsageStats`、`BillingUsageEventV2RawTable` / `DPPBillingUsageEventV2RawTable`、
`DPPBackupInstanceUsageStats`、`ProtectionBillingStats`、`DatasourceSummaryStats`。

---

## 已知坑（复现记录）

- `round()` 套在 `arg_max/arg_min` 返回值上会报 `SEM0201: round(): argument #1 expected to be a numeric expression` → 去掉 `round`。
- `arg_max/arg_min` 经本 MCP 返回时列名/值会错位 → 不要用它取"最后值"；改用均值/极值的 `min/max/avg`。
- `split(...)[-1]` 是 dynamic，`summarize ... by` 前必须 `tostring()`，否则报 `SEM0001`。
- 时间列含 null 时，`arg_max`/分桶会报 `DateTime.Ticks must not be negative` → 先 `where isnotnull(PreciseTimeStamp)`。
- 不加时间过滤会全表扫描（该库有近两年历史），易超时。

## 已核对样例（门户口径 = 近 24h 均值）

### 样例 1：cn3sr（3 个 AzureBackupServer/MABS 项）
`/subscriptions/c1fe03e6-ff80-4d91-824d-ba495a000792/resourceGroups/fuzlpalo/providers/Microsoft.RecoveryServices/vaults/cn3sr`

| 口径 | 值 |
|---|---|
| 门户显示 | 76.38 MB |
| 近 24h 均值（本方法） | 77.81 MB |
| 近 30d 均值 | 68.16 MB |
| 30d min / max | 57.81 / 107.80 MB |

### 样例 2：testvault（1 个 IaaSVM 项 win10-docker）
`/subscriptions/c1fe03e6-ff80-4d91-824d-ba495a000792/resourceGroups/cn3rg/providers/Microsoft.RecoveryServices/vaults/testvault`

| 口径 | 值 |
|---|---|
| 门户显示 | 55 GB |
| 近 24h 均值（本方法） | 56,392.72 MB = 55.07 GB |
| 近 30d 均值 | 54,603.62 MB = 53.32 GB |
| 30d min / max | 46,063 / 63,982 MB |

> 匹配保管库必须用**整条 resourceId**（`=~` 或 `contains "<完整路径>"`）。短名会误命中

→ 结论：门户口径 = **近期（≈24h）均值**；长窗口（30d）均值偏低。
