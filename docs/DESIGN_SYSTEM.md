# Wanwu Lattice 设计系统

> 用于 `apps/wanwu-shell` 与扩展 Webview。目标：商业级、简约易懂、Agent-first，与 VS Code 默认外观结构级区分。  
> 实现时遵循仓库内 skill：`.agents/skills/frontend-design`、`ui-design-brain`、`effective-ui-design`（源自 GitHub 社区 Agent Skills）。

## 原则

1. **最多三层表面**：bg → surface-1 → surface-2  
2. **文案优先**：关键操作有文字标签；按钮动词在前（「保存设置」「打开文件夹」）  
3. **强调色非 VS 蓝**：主强调玉青绿，次强调信号蓝（非电紫霓虹）  
4. **Agent-first**：Orbit 顶栏 + Agent Studio，无左侧经典 Activity 五图标竖条  
5. **8pt 间距网格**；焦点可见；尊重 `prefers-reduced-motion`  
6. **密钥不上仓库**：UI 写入 `~/.wanwu/credentials.env`（0600）

## 视觉方向（商业）

- **Subject**：AI-native IDE 整机（Wanwu Code）  
- **Audience**：需要 BYOK、快速进入 Agent 回合的专业开发者  
- **Signature**：Orbit Mode 分段轨 + Agent Studio 对话流 + Welcome Gate 三步上手  
- **Avoid**：紫白渐变模板、过重 glow、无标签图标墙、奶油衬线+陶土色默认套装  

## Tokens

| Token | 值 | 用途 |
|---|---|---|
| `--ww-bg` | `#0A0F1A` | 应用底 |
| `--ww-surface-1` | `#121A2A` | 侧栏 / 面板 |
| `--ww-surface-2` | `#1A2438` | 卡片 / 抬升 |
| `--ww-border` | `#2A3852` | 分割线 |
| `--ww-text` | `#E8EEF8` | 主文字 |
| `--ww-muted` | `#91A0B8` | 次要 |
| `--ww-accent` | `#2AD4A0` | 主强调 / Primary |
| `--ww-accent-2` | `#4F8CFF` | 次强调（信号蓝） |
| `--ww-danger` | `#F25F7C` | 拒绝 / 错误 |
| `--ww-radius-md` | `8px` | 控件 |
| `--ww-radius-lg` | `12px` | 卡片 |
| `--ww-font-ui` | `"DM Sans", "Noto Sans SC", …` | UI |
| `--ww-font-mono` | `"JetBrains Mono", …` | 代码 |

**禁止**：`#007ACC` 作为状态栏/主强调；照搬 VS Code Welcome + 左 Activity 组合；密钥写入 git。

## 组件

- **Orbit Bar**：Logo · Mode 分段 · 工作区标签 · 打开/保存/终端/**模型设置**  
- **Welcome Gate**：无工作区时的三步上手（设置 → 打开文件夹 → Agent）  
- **Settings Drawer**：右侧抽屉；Provider / Model / Base URL / API Key  
- **Mode Pill**：Ask / Plan / Agent / Verify（圆角矩形分段，非糖果 pill 堆叠）  
- **Message Card** / **Tool Chip** / **Primary Button**  

## Skills 来源

| Skill | Upstream |
|---|---|
| frontend-design | [anthropics/skills](https://github.com/anthropics/skills) |
| ui-design-brain | [carmahhawwari/ui-design-brain](https://github.com/carmahhawwari/ui-design-brain) |
| effective-ui-design | [sebastian-software/effective-ui-design-skill](https://github.com/sebastian-software/effective-ui-design-skill) |
