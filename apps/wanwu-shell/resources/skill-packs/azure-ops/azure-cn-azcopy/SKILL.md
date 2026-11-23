---
name: azure-cn-azcopy
description: "Azure China azure-cn-azcopy operations"
---

# Azure China AzCopy Skill

AzCopy 数据传输 — Azure China (世纪互联)。无二次确认，直接执行。

## 数据平面角色 (不同于 ARM)

| 角色 | 能力 |
|------|------|
| Storage Blob Data Reader | list, download |
| Storage Blob Data Contributor | list, download, upload, delete |

## 中国区 URL

```
Blob: https://<account>.blob.core.chinacloudapi.cn/<container>/<path>
File: https://<account>.file.core.chinacloudapi.cn/<share>/<path>
```

## 登录

```python
azure_azcopy_auto_login()  # 同时登录 azcopy + az CLI
```

其他方式: SAS Token (附加到 URL) 或 `account_key` 参数。

## 命令

通过 `azure_azcopy_operate(command, account_key)` 执行。

```
list "https://myaccount.blob.core.chinacloudapi.cn/container"
copy "C:\file.txt" "https://myaccount.blob.core.chinacloudapi.cn/container"
sync "C:\data" "https://myaccount.blob.core.chinacloudapi.cn/container"
remove "https://myaccount.blob.core.chinacloudapi.cn/container/old.txt"
make "https://myaccount.blob.core.chinacloudapi.cn/newcontainer"
```

## 函数

| 函数 | 用途 |
|------|------|
| `azure_azcopy_auto_login()` | 智能登录 (azcopy + az CLI) |
| `azure_azcopy_login_tenant(tenant_id)` | 设备码登录 |
| `azure_azcopy_logout()` | 登出 |
| `azure_azcopy_operate(cmd, account_key)` | 通用命令 |
| `azure_azcopy_list(account, container, path, sas)` | 列出 Blob |
| `azure_azcopy_list_accounts(name_prefix)` | 列出存储账户 (ARM) |
| `azure_azcopy_upload(...)` | 上传 |
| `azure_azcopy_download(...)` | 下载 |
| `azure_azcopy_sync(direction, ...)` | 同步 |
| `azure_azcopy_remove(...)` | 删除 |
| `azure_azcopy_build_url(...)` | 构建 URL |

## 特性

- 90 秒 subprocess 超时
- `auto_login()` 同时登录 azcopy 和 az CLI
- `list_storage_accounts()` 通过 ARM 发现账户
- AAD endpoint: `https://login.chinacloudapi.cn`
