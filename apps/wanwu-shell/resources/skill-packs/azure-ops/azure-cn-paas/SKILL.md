---
name: azure-cn-paas
description: "Azure China azure-cn-paas operations"
---

# Azure China PaaS Skill 使用指南

你拥有通过 Azure CLI 读取 Azure 中国世纪互联云 PaaS 资源的权限。请严格遵守以下流程。

## 1. 登录认证

- 在**任何资源操作前**，必须确保已登录。
- **登录方式**：调用 `azure_login_identity()`，内部执行 `az login --identity`。
- 云环境会自动设置为 **Azure China (AzureChinaCloud)**。
- **注意**：托管标识仅在已配置 Managed Identity 的环境中有效（如 VM、Azure Functions、App Service、ACI 等）。若在本地或未配置托管标识的环境中，需由用户手动在终端执行 `az login` 并选择中国区云。

## 2. 支持的 PaaS 资源与命令示例

所有操作默认针对 **Azure 中国区**。以下为**以读取为主**的常用命令示例（list/show/get）：

| 资源类型 | CLI 命令组 | 示例命令 |
|----------|-------------|----------|
| App Service | `az webapp` | `webapp list -g <资源组>`、`webapp show -n <名称> -g <资源组>` |
| Azure Function | `az functionapp` | `functionapp list -g <资源组>`、`functionapp show -n <名称> -g <资源组>` |
| API Management | `az apim` | `apim list`、`apim show -n <名称> -g <资源组>` |
| Azure Service Bus | `az servicebus` | `servicebus namespace list`、`servicebus namespace show -n <名称> -g <资源组>` |
| Azure Event Hub | `az eventhubs` | `eventhubs namespace list`、`eventhubs eventhub list -n <命名空间> -g <资源组>` |
| Azure Redis Cache | `az redis` | `redis list`、`redis show -n <名称> -g <资源组>` |
| Data Lake Storage Gen2 | `az storage` | `storage account list`、`storage fs list --account-name <账户名>`（需先登录） |
| Azure Key Vault | `az keyvault` | `keyvault list`、`keyvault secret list --vault-name <名称>`（仅列名，不读值） |
| Logic App | `az logic` | `logic workflow list -g <资源组>`、`logic workflow show -n <名称> -g <资源组>` |
| Application Insights | `az monitor app-insights` | `monitor app-insights component list`、`monitor app-insights component show -a <名称> -g <资源组>` |

- 使用 `azure_paas_operate(command)` 执行命令时，**不要**在命令前加 `az `，直接写子命令即可，例如：`webapp list -g MyRG`。

## 3. 资源操作

- 执行命令：调用 `azure_paas_operate(command, confirmed=False)`。
- **以读取为主**：优先使用 `list`、`show`、`get` 等只读子命令，可直接执行。
- 若用户明确要求执行**写操作**（如 create/update/delete），必须遵守下面的安全确认机制。

## 4. 安全确认机制（写操作）

- **只读操作**（如 `list`、`show`、`get`）：可直接执行，无需确认。
- **写操作**（如 `create`、`delete`、`update`、`set`、`revoke`、`purge` 等）：
  1. 首次调用工具时，若检测到危险操作，会返回 `status: confirmation_required`。
  2. 你必须将工具返回的警告信息**完整展示给用户**。
  3. **等待用户明确回复「确认执行」或「是」**。
  4. 用户确认后，**再次调用**同一工具，并传入参数 `confirmed=True`。
  5. **严禁**在用户未确认的情况下传入 `confirmed=True`。

## 5. 环境与故障排查

- 所有操作默认针对 **Azure China (AzureChinaCloud)**，区域示例：chinaeast2、chinanorth2、chinanorth3。
- 若命令报错：检查资源组名称、资源名称、区域是否属于中国区；确认已成功调用 `azure_login_identity()` 或用户已手动 `az login` 并选择中国云。
- 若托管标识登录失败：提示用户当前环境可能未配置 Managed Identity，或改用手动 `az login`。
