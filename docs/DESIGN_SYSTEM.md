# Wanwu Lattice 设计系统

> 用于 `apps/wanwu-shell` 与扩展 Webview。目标：简约易懂、现代科技感，与 VS Code 默认外观结构级区分。

## 原则

1. **最多三层表面**：bg → surface-1 → surface-2  
2. **文案优先**：关键操作有文字，不只靠图标  
3. **强调色非 VS 蓝**：主强调青绿，次强调电紫  
4. **Agent-first**：Orbit 顶栏 + Agent Studio，无左侧经典 Activity 五图标竖条  

## Tokens

| Token | 值 | 用途 |
|---|---|---|
| `--ww-bg` | `#070B14` | 应用底 |
| `--ww-surface-1` | `#0F1524` | 侧栏 / 面板 |
| `--ww-surface-2` | `#162033` | 卡片 |
| `--ww-border` | `#243049` | 分割线 |
| `--ww-text` | `#E7EEF9` | 主文字 |
| `--ww-muted` | `#8B9BB8` | 次要 |
| `--ww-accent` | `#2EE6A6` | 主强调 |
| `--ww-accent-2` | `#7B61FF` | 次强调 |
| `--ww-danger` | `#FF5C7A` | 拒绝 / 错误 |
| `--ww-radius-lg` | `16px` | 卡片 |
| `--ww-radius-pill` | `999px` | Mode 分段 |
| `--ww-font-ui` | `"DM Sans", "Noto Sans SC", system-ui, sans-serif` | UI |
| `--ww-font-mono` | `"JetBrains Mono", "Sarasa Mono SC", ui-monospace, monospace` | 代码 |

**禁止**：`#007ACC` 作为状态栏/主强调；照搬 VS Code Welcome + 左 Activity 组合。

## 组件

- **Orbit Bar**：顶栏 Logo · Mode Pill · 会话 · 窗口控件  
- **Mode Pill**：Ask / Plan / Agent / Verify 分段  
- **Message Card**：用户/助手分层玻璃卡片  
- **Tool Chip**：工具调用时间线条目  
- **Primary Button**：青绿填充；Reject 用 `--ww-danger`  
