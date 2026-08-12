# IDE 宿主接入（ACP）

Wanwu Agent 通过 **Agent Client Protocol（ACP）** 接入编辑器。当前官方宿主：

| 宿主 | 状态 | 接入方式 |
|---|---|---|
| Wanwu Shell（自研 Electron） | ✅ 默认 | 内置 ACP client |
| VS Code / Cursor | ✅ 可选 | `extensions/wanwu-vscode` |
| Zed | ⚠️ 兼容 | 配置 external agent 指向 `wanwu acp` |
| JetBrains | ⚠️ 兼容 | 通过 ACP 插件或外部工具配置 |

## Zed

`settings.json`：

```json
{
  "agent": {
    "default_model": "wanwu",
    "custom_agents": {
      "wanwu": {
        "command": "wanwu",
        "args": ["acp"]
      }
    }
  }
}
```

或使用绝对路径：

```json
{
  "agent": {
    "custom_agents": {
      "wanwu": {
        "command": "/usr/local/bin/wanwu",
        "args": ["acp"]
      }
    }
  }
}
```

## JetBrains

1. 安装支持 ACP 的插件（或 JetBrains AI Assistant 的 external agent 能力）。
2. 将 agent 命令指向 `wanwu acp`。
3. 工作区根目录设为项目根。

## 验证

```bash
# 本机握手
pnpm exec tsx scripts/acp-handshake-native.mts

# 或打包后
node dist-bin/wanwu.mjs acp
```

## 限制

- `session/load` 已支持；`session/cancel` 已支持
- 权限弹窗依赖宿主实现 `session/request_permission`
- Diff Review 依赖宿主渲染 `content.type = "diff"`
