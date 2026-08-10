# Changelog

## 0.1.0 — 2026-08-10

### Added
- Product blueprint: vision, architecture, competitive analysis, ADRs, roadmap
- `wanwu` CLI: `doctor`, `inspect`, `acp`, `exec`, `plan`, `verify`, `check-perm`, `hooks`, `memory-writeback`
- Grok Build ACP bridge (`acp_backend=grok`) with `WANWU_ACP_COMMAND` override
- Multi-model config schema (xAI / OpenAI / Anthropic / Ollama / custom)
- VS Code extension: Wanwu Chat, Ask/Plan/Agent/Verify, mock ACP, tool timeline, permission prompts
- Diff Review wired to mock Edit proposals (Accept applies file)
- Deny-first permission matcher and PostToolUse hooks (echo + prettier-style)
- `examples/failing-test-demo` + `scripts/demo-e2e.sh` / `scripts/smoke-acp.sh` / `scripts/acp-handshake.mts`
- `docs/WORKFLOW.md`, `THIRD_PARTY_NOTICES`
- Packaging: `pnpm package:extension` → VSIX；`pnpm build:cli` → `dist-bin/wanwu.mjs`
- Phase 5: `wanwu parallel demo` worktree isolation；`wanwu cloud submit --run` local headless runner (review-first)
- Phase 6: Code-OSS 1.96 branded as Wanwu Code；builtin extension；compile + Electron `wanwu-code` launch scripts
- Extension: `Wanwu: New Parallel Session` / `List Sessions`

### Notes
- Code-OSS IDE shell and cloud multi-agent runners remain deferred epics
- Real Grok binary not required for mock-based local smoke tests
- GUI screen recording still requires a local VS Code/Cursor host
