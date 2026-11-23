---
name: azure-cn-network
description: "Azure China azure-cn-network operations"
---

# Azure China Network Skill

Azure China (世纪互联) 网络资源管理。无二次确认，直接执行。

## 登录

```python
azure_network_auto_login()  # 托管标识优先
```

## 命令

通过 `azure_network_operate(command)` 执行。Token 过期自动重登录。

支持: nsg, vnet, private-dns, dns, private-endpoint, vnet-gateway,
route-table, application-gateway, afd, traffic-manager, express-route

```
network vnet list -g MyRG -o table
network nsg list -g MyRG -o table
network nsg rule list --nsg-name MyNSG -g MyRG -o table
network private-endpoint list -g MyRG -o table
network private-dns zone list -g MyRG -o table
```

## 函数

| 函数 | 用途 |
|------|------|
| `azure_network_auto_login()` | 智能登录 |
| `azure_network_login(user, pass)` | 密码登录 |
| `azure_network_operate(cmd)` | 网络 CLI 命令 |

## 特性

- 90 秒 subprocess 超时
- Token 过期自动重登录
- JMESPath 中文键自动翻译
- `--query` 别名必须用英文
