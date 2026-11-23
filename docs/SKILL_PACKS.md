# Skill packs（用户级，非工作区）

Azure ops 等技能安装在：

```
~/.wanwu/skill-packs/azure-ops/
  AKS/SKILL.md
  _shared/scripts/...
```

Shell 首次启动会把内置包复制到上述目录，并设置环境变量：

- `WANWU_SKILLS_ROOT` → 当前包根目录
- `WANWU_SKILL_PACKS` → `~/.wanwu/skill-packs`

技能正文中的共享脚本路径已统一为 `$WANWU_SKILLS_ROOT/_shared/...`。

## MCP（Kusto）

勿使用个人机器上的绝对路径。将 `resources/skill-packs/azure-ops/_shared/mcp.kusto.example.toml` 复制为 `~/.wanwu/mcp.toml`，按需填写集群 URL（可参考 `_shared/clusters.json`）。

默认建议：

```toml
[mcp.servers.kusto-mcp]
command = "npx"
args = ["-y", "kusto-mcp"]
env = { KUSTO_AUTH_METHOD = "azure-cli" }
```

## 维护内置包

```bash
# 从上传 zip 重新生成 resources（可选 WANWU_AZURE_PACK_ZIP=...）
node scripts/stage-azure-ops-pack.mjs
```