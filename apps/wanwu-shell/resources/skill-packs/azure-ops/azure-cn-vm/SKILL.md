---
name: azure-cn-vm
description: "Azure China azure-cn-vm operations"
---

# Azure China VM Skill

Azure China (世纪互联) VM 管理。无二次确认，直接执行。

## 权限

Reader + Virtual Machine Contributor

## 登录

```python
azure_vm_auto_login()  # 托管标识优先
```

MFA 用户: `az cloud set --name AzureChinaCloud && az login`

## 命令

通过 `azure_vm_operate(command)` 执行（省略 `az` 前缀）。Token 过期自动重登录。

```
vm list --show-details -o table
vm show -n MyVM -g MyRG --show-details
vm start -n MyVM -g MyRG --no-wait
vm deallocate -n MyVM -g MyRG --no-wait
vm resize -n MyVM -g MyRG --size Standard_D4s_v3
disk list -g MyRG -o table
vm list-sizes -l chinanorth3
```

## 函数

| 函数 | 用途 |
|------|------|
| `azure_vm_auto_login()` | 智能登录 |
| `azure_vm_login(user, pass)` | 密码登录 |
| `azure_vm_operate(cmd)` | 通用 az CLI |
| `azure_vm_list(rg)` | 列出 VM |
| `azure_vm_power(action, name, rg)` | 开关机 |
| `azure_vm_run_command(name, rg, scripts)` | 远程脚本 |
| `azure_vm_resize(name, rg, size)` | 调整规格 |
| `azure_vm_snapshot(action, name, rg, source)` | 快照管理 |

## JMESPath

`--query` 别名必须用英文，中文键会自动翻译但建议直接用英文。

## 特性

- 90 秒 subprocess 超时
- Token 过期自动 `az login --identity` 重试
- VM 开关机 `--no-wait`
- JMESPath 中文键自动翻译
