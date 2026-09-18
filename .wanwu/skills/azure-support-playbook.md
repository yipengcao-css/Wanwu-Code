# Azure 支持排障 Playbook（模板）

> 这是一个**模板**。复制改名（如 `azure-network-troubleshooting.md`）后按你团队的实际
> SOP 扩展。命令中的资源名请用占位符，切勿写入订阅 ID / 密钥等敏感信息。

## 适用场景

客户报告 Azure 资源异常（连接失败、5xx、延迟高、部署失败、鉴权报错等），需要按标准流程
快速定位是 **配置 / 网络 / 配额 / 平台** 哪一类问题。

## 通用诊断顺序

1. 明确范围：受影响的 `资源类型 / 区域 / 订阅 / 时间窗`，是否近期变更过。
2. 看健康与活动日志：
   - Resource Health（资源运行状况）是否报平台事件。
   - Activity Log 最近的写操作（谁在何时改了什么）。
   ```bash
   az monitor activity-log list --resource-group <rg> --offset 6h -o table
   ```
3. 看指标与诊断日志：相关资源的 Metrics（错误率、延迟、CPU/内存、限流）。
4. 二分定位：区分是客户端、网络路径、还是服务端问题。

## 分类排障

### 网络 / 连接
- 检查 NSG / UDR / Firewall / Private Endpoint / DNS 解析。
```bash
az network nsg rule list --nsg-name <nsg> -g <rg> -o table
nslookup <fqdn>
```
- 常见根因：NSG 拦截、私有端点 DNS 未指向、UDR 把流量引到 NVA。

### App Service / Functions
- 看 App 的 HTTP 5xx、启动失败、应用设置与运行时版本。
```bash
az webapp log tail -n <app> -g <rg>
```
- 常见根因：应用设置缺失、端口/健康检查、依赖不可达、冷启动。

### AKS / 容器
```bash
kubectl get pods -A -o wide
kubectl describe pod <pod> -n <ns>
kubectl logs <pod> -n <ns> --previous
```
- 常见根因：镜像拉取失败、探针失败、资源不足、节点 NotReady。

### Storage / 数据面
- 检查网络规则、SAS/密钥、层级与限流（429）。
- 常见根因：防火墙未放行、SAS 过期、达到带宽/IOPS 上限。

### 鉴权 / 权限
- 检查 RBAC 角色分配、托管标识、AAD 应用权限与令牌受众。
- 常见根因：缺少角色、令牌 audience 不匹配、密钥/证书过期。

### 配额 / 限流
- 看订阅/区域配额与 429/限流指标；必要时提配额工单。

## 判定与升级

- 若 Resource Health / 平台事件确认为平台侧 → 记录事件 ID，跟踪官方修复。
- 若为配置/客户侧 → 给出最小复现与整改步骤。
- 升级前收集：资源 ID、时间窗（UTC）、request id / correlation id、相关日志片段。

## 收尾

- 记录根因、处置、预防措施；如有通用结论，考虑沉淀为新的 skill。
