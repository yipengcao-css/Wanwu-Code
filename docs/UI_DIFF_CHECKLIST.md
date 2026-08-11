# Wanwu Shell ↔ VS Code 外观对照清单

用于验收自研壳与 Visual Studio Code 默认暗色 Workbench 的结构级差异。

| # | 差异点 | 状态 |
|---|---|---|
| 1 | 无左侧经典 Activity Bar 五图标竖条 | [x] |
| 2 | 顶栏为 Orbit Bar（Logo + Mode Pill），非 VS 菜单+搜索条克隆 | [x] |
| 3 | Agent Studio 为独立主面板（右栏玻璃对话），非 VS Chat 仿品 | [x] |
| 4 | 状态栏非 `#007ACC` 蓝底 | [x] |
| 5 | 主强调色青绿 `#2EE6A6` / 电紫 `#7B61FF` | [x] |
| 6 | 编辑器为 Monaco 内嵌于自研壳，无 Code Welcome 克隆页 | [x] |
| 7 | 产品窗口标题为 Wanwu Code，无 Visual Studio Code 品牌 | [x] |
| 8 | 终端为底部抽屉，非默认 Panel 图标体系 | [x] |

改造前基线（Code-OSS 套壳）：`/opt/cursor/artifacts/wanwu-ide-desktop.png`  
改造后证据：
- `/opt/cursor/artifacts/wanwu-shell-desktop.png`
- `/opt/cursor/artifacts/wanwu-shell-agent-success.png`
- `/opt/cursor/artifacts/wanwu-shell-walkthrough.mp4`
