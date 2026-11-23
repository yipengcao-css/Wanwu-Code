---
name: azure-vmreboottroubleshooting
description: "通过 Kusto MCP 查询 Azure Data Explorer 集群中存储的的日志记录，查询分析azure虚拟机重启的原因"
author: test
trigger:
  - 查询azure虚拟机重启的原因
---

# Azure VM 查询技能手册

# 本文档包含从kusto数据库中提取所有Kusto查询语句，用于Azure虚拟机的故障排除。

## 数据源配置

### Kusto集群连接信息
- **VM数据库**: `https://azurecm.chinanorth2.kusto.chinacloudapi.cn`
  - 数据库: `Azurecm`



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

---
## 常用参数

- `_customerSubID`: 客户订阅ID
- `_VMName`: 虚拟机名称
- `_startTime`: 开始时间
- `_endTime`: 结束时间
- `_nodeId`: 节点ID

# 查询方法

## 1. VM 查询

### 1.1 获取VM所在节点nodeID
```kusto
cluster('azurecm.chinanorth2').database('Azurecm').LogContainerSnapshot
| where (TIMESTAMP >= _startTime and TIMESTAMP < _endTime)
| where subscriptionId == _customerSubID and  roleInstanceName contains _VMName
| project TIMESTAMP,roleInstanceName,nodeId,availabilitySetName,AvailabilityZone,billingType,Tenant,containerId,tenantName,subscriptionId
```

### 1.2 获取VM所在节点健康状态及具体报错信息
```kusto
cluster('azurecm.chinanorth2').database('Azurecm').TMMgmtNodeTraceEtwTable 
| where (TIMESTAMP >= _startTime and TIMESTAMP < _endTime)
| where SourceNodeId in (
_nodeId
) 
| project PreciseTimeStamp, nodeState, nodeAvailabilityState, faultInfo, containerCount, aliveContainerCount, isIsolated, isOffline,nodeId 
```


## 2. VM RCA 
事件信息 (Incident Information)
事件ID (Incident  ID)	
事件名称 (Incident Title)	虚拟机无法访问
受影响的服务 (Service Impacted)	Azure虚拟机
 
总结 (Summary)
Microsoft Azure China技术支持团队关于您的订阅号 _customerSubID  中虚拟机  _VMName 在北京时间 _startTime 无法访问事件的调查分析已完毕。
通过后台排查和分析，虚拟机迁移至正常物理节点并启动。
对本次虚拟机服务中断给您业务带来的不利影响，我们深表歉意。我们正在不断采取措施来优化Microsoft Azure平台及运维流程，力争避免将来该问题再次发生，并希望得到您持续的支持与关注。
由此可能为您带来的不便，我们深表歉意。
 
服务相关信息：
故障起始和结束时间：虚拟机当时所在的物理节点在 _startTime  发生故障，虚拟机迁移至正常物理节点，后续启动成功。
受影响时候的所在时区：UTC+8
受影响的Sub ID：_customerSubID 
受影响的服务和服务名称（如虚拟机名称等）： _VMName
如果涉及虚拟机，虚拟机是否部署了可用性集： 
受影响的虚拟机是否使用了SSD存储： 