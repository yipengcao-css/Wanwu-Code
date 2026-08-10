# Changelog

## 0.1.0 — 2026-08-10

### Added
- Product blueprint: vision, architecture, competitive analysis, ADRs, roadmap
- `wanwu` CLI: `doctor`, `inspect`, `acp`, `exec`, `plan`, `verify`, `check-perm`, `hooks`, `memory-writeback`
- Grok Build ACP bridge (`acp_backend=grok`) with `WANWU_ACP_COMMAND` override
- Multi-model config schema (xAI / OpenAI / Anthropic / Ollama / custom)
- VS Code extension: Wanwu Chat, Ask/Plan/Agent/Verify, mock ACP, tool timeline, permission prompts
- Deny-first permission matcher and PostToolUse hooks example
- `examples/failing-test-demo` + `scripts/demo-e2e.sh` / `scripts/smoke-acp.sh`
- Draft packaging: `pnpm package:extension` → VSIX

### Notes
- Code-OSS IDE shell and cloud runners remain deferred epics
- Real Grok binary not required for mock-based local smoke tests
