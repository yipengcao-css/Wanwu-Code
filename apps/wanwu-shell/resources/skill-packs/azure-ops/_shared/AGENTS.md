# _shared —— ADX / Kusto 共享资产

本目录被 `../<skill>/SKILL.md` 引用，路径一律写成 `$WANWU_SKILLS_ROOT/_shared/...`。

| 文件 | 作用 |
| --- | --- |
| `clusters.json` | 19 个 ADX 集群清单（`KUSTO_CLUSTER_URL` + `KUSTO_DEFAULT_DATABASE`），唯一事实来源 |
| `gen_mcp_servers.cjs` → `mcp.servers.generated.json` | 由清单生成 MCP `mcp.servers` 条目，不手抄 |
| `scripts/kusto_probe.py` | 批量探测 query / `.show databases` 权限 |
| `scripts/probe_kusto_access.py` | 批量探测访问权限（200 / 403 / 401 判定） |
| `scripts/query-adx.py` | 单集群执行 KQL（token 作为参数传入） |
| `scripts/kq.py` | 单集群执行 KQL（内部取 token，默认只打印结果表，`--json` 出原始响应） |
| `scripts/kusto_dbscan.py` | 扫描可见数据库 |
| `get_kusto_token.py` | 用 `az account get-access-token` 取 token |

## 技能镜像（只读副本）

沙箱只允许读写本工作区，`../<name>/SKILL.md` 读不到，因此把同级 14 个技能的
`SKILL.md` 复制到 `.agents/skills/<name>/SKILL.md`，可直接 Read 全文：

`AKS` `appgwupdatefail` `azureasrkusto` `azurebackupkusto` `azurefirewall`
`azureresourcegraph` `backusage` `everflow` `frontend-design-3` `operationcheck`
`vmreboot` `vmupdate` `vpngateway` `vpngateway-lookup`

- 镜像目录是生成物，不要手改；源文件在 `skills/skills/<name>/SKILL.md`。
- 同步：`python scripts/sync_skills.py`；校验：`python scripts/sync_skills.py --check`；
  清理已删除的技能：加 `--prune`。
- Wanwu 按需加载某个技能：在提问前加 `[SKILLS=agents/azureasrkusto]`（可逗号分隔多个）。
