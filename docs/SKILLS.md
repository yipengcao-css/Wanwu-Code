# Skills（内部 troubleshooting SOP）

Skills 让你把「团队内部排障流程 / SOP」交给 Wanwu Agent 复用。适合把 Azure 支持团队
的常见诊断步骤、命令、判定标准沉淀成可被 Agent 直接使用的知识。

## 放在哪里

每个 skill 是一个文件，放在工作区的：

```
<workspace>/.wanwu/skills/*.md      # 推荐：Markdown SOP
<workspace>/.wanwu/skills/*.toml    # 可选：结构化配置
```

- 一个文件 = 一个 skill；文件名建议用 kebab-case，见名知意（如 `azure-network-troubleshooting.md`）。
- 密钥、订阅信息等敏感内容**不要**写进 skill；只写流程与占位符（如 `<subscription-id>`）。

## 产品如何发现 / 使用

- 发现：`wanwu inspect` 会列出已发现的 skills 与 `skillsDir`：

  ```bash
  pnpm wanwu inspect | jq '{skills, skillsDir}'
  ```

  在 IDE 里，「上下文 / Context」面板也会列出 memory / skills / rules / hooks / MCP。

- 使用：启用 skills 注入后，`.wanwu/skills/*.md` 的内容会被拼进 Agent 的系统提示，
  Agent 在排障任务中会遵循这些 SOP（native 后端）。

## 写一个好用的 skill

一个 Markdown skill 建议包含：

1. **H1 标题** —— 这个 SOP 解决什么问题。
2. **适用场景** —— 什么症状/告警时该用它。
3. **诊断步骤** —— 有序、可执行，尽量给出具体命令。
4. **判定标准** —— 每步看什么、如何判断根因。
5. **升级/收尾** —— 何时升级、需要记录什么。

> 保持简洁聚焦：一个 skill 只解决一类问题；命令用占位符代替真实资源名。

参考模板：`.wanwu/skills/azure-support-playbook.md`（可复制改名后扩展）。

## 快速开始

```bash
mkdir -p .wanwu/skills
cp .wanwu/skills/azure-support-playbook.md .wanwu/skills/my-scenario.md
$EDITOR .wanwu/skills/my-scenario.md
pnpm wanwu inspect | jq '.skills'    # 确认已被发现
```
