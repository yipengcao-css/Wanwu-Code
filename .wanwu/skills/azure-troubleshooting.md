# Skill: Azure Troubleshooting (starter template)

> 内部 SOP 模板。Agent 在 `agent`/`ask` 模式下会把本目录（`.wanwu/skills/*.md`）中的技能作为 SOP 注入上下文。
> 复制本文件并按具体场景编写你们的排查手册（每个场景一个 `.md`）。

## When to use
描述触发该 SOP 的症状/信号（例如：VM 无法出网、NSG/ASG 规则不生效、Load Balancer 探针失败、存储 403、AKS Pod CrashLoopBackOff…）。

## Inputs to collect
- 订阅 / 资源组 / 资源名 与 region
- 复现时间窗口（UTC）与关联 correlation/request id
- 相关配置片段（NSG 规则、路由表、诊断设置）

## Diagnosis steps
1. 明确期望行为 vs 实际行为（一句话）。
2. 缩小范围：控制面（ARM/portal）还是数据面（运行时）？
3. 按依赖链自顶向下检查（身份 → 网络 → 资源配置 → 配额/限流）。
4. 用命令/日志取证，不要只凭猜测（见下）。

## Useful commands (示例，按需增改)
```bash
# 身份/订阅
az account show -o table
# 网络：NSG 有效规则
az network nic list-effective-nsg --name <nic> --resource-group <rg> -o jsonc
# 连通性排查
az network watcher test-connectivity --source-resource <vm> --dest-address <ip> --dest-port <port>
# 资源健康
az resource show --ids <resourceId> --query properties.provisioningState
```

## Decision / escalation
- 命中已知问题 → 给出修复步骤与验证方法。
- 无法定位 → 收集上述 Inputs + 取证输出，升级并附 correlation id。

## Verify the fix
说明如何确认问题已解决（重新执行触发动作 + 观察指标/日志转正常）。
