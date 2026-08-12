# Shell LSP（多语言）

Wanwu Shell 用 **stdio LSP** 为编辑器提供诊断，并写入 Monaco markers。默认支持 TS/JS；其他语言通过注册表 + PATH 解析接入。

## 内置 server

| Server | 语言 | 来源 |
|---|---|---|
| `typescript` | ts/tsx/js/jsx | 依赖 `typescript-language-server` |
| `rust` | rust | PATH `rust-analyzer` |
| `python` | python | PATH `pyright-langserver` |
| `go` | go | PATH `gopls` |
| `clangd` | c/cpp | PATH `clangd` |
| `json` / `css` / `html` | json/css/html | PATH `vscode-*-language-server`（optIn） |

## 工作区覆盖

`.wanwu/lsp.toml` 或 `.wanwu/lsp.json` 可覆盖/新增 server：

```toml
[servers.typescript]
command = "typescript-language-server"
args = ["--stdio"]
languages = ["typescript", "typescriptreact", "javascript", "javascriptreact"]

[servers.my-python]
command = "pylsp"
args = []
languages = ["python"]
```

同 `id` 覆盖内置；新 `id` 追加。

## 环境变量覆盖

- `WANWU_LSP_<ID>_COMMAND`：覆盖任意 server 启动命令（自动追加原 args）
- `WANWU_TSSERVER_COMMAND`：TS 兼容旧变量

## 行为

1. 打开文件 → 按 `languageId` 路由到 server → 懒启动 → `didOpen`
2. 编辑防抖 300ms → `didChange`
3. 关闭标签 → `didClose`
4. `publishDiagnostics` → `monaco.editor.setModelMarkers(..., "wanwu-lsp", ...)`
5. 切换工作区时销毁全部 LSP 进程

## 验证

```bash
pnpm --filter wanwu-shell test
pnpm --filter wanwu-shell typecheck
# 手工：pnpm shell:dev → 打开 .rs/.py/.go（需本机装对应 server）
```
