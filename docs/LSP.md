# Shell TypeScript LSP（MVP）

Wanwu Shell 用 **typescript-language-server**（stdio LSP）为 `.ts/.tsx/.js/.jsx` 提供诊断，并写入 Monaco markers。这不是完整 VS Code 语言服务栈；多语言 / 补全 / 重构后续分期。

## 行为

1. 打开 TS/JS 文件 → `textDocument/didOpen`
2. 编辑防抖 300ms → `textDocument/didChange`
3. 关闭标签 → `textDocument/didClose`
4. 服务端 `publishDiagnostics` → 渲染进程 `monaco.editor.setModelMarkers(..., "wanwu-lsp", ...)`
5. 切换工作区时销毁并重建 LSP 进程

## 启动解析

顺序：

1. 环境变量 `WANWU_TSSERVER_COMMAND`（可含空格参数；自动追加 `--stdio`）
2. `wanwu-shell` 依赖中的 `typescript-language-server`（`lib/cli.mjs`）
3. 仓库 `node_modules/.bin/typescript-language-server`
4. PATH 上的 `typescript-language-server`

工作区需自带可用的 `typescript`（或使用 shell 依赖中的 TypeScript）。

## 验证

```bash
pnpm --filter wanwu-shell test
pnpm --filter wanwu-shell typecheck
# 手工：pnpm shell:dev → 打开含类型错误的 .ts → 编辑器红线
```
