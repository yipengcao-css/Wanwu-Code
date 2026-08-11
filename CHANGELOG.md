# Changelog

## 1.0.0-beta — 2026-08-11

Wanwu-Code **v1.0 beta** — 首个对外预发布。

### Added
- Product blueprint: vision, architecture, competitive analysis, ADRs, roadmap
- `wanwu` CLI: `doctor`, `inspect`, `acp`, `exec`, `plan`, `verify`, `check-perm`, `hooks`, `memory-writeback`, `parallel`, `cloud`
- Grok Build ACP bridge (`acp_backend=grok`) with `WANWU_ACP_COMMAND` override + mock ACP for local smoke
- Multi-model config schema (xAI / OpenAI / Anthropic / Ollama / custom)
- VS Code extension: Wanwu Chat, Ask/Plan/Agent/Verify, Diff Review, permissions, multi-session
- Deny-first permission matcher and runnable hooks
- `examples/failing-test-demo` + smoke/demo scripts
- Parallel worktree isolation (`wanwu parallel demo`)
- Cloud headless runner: local worktree + Docker (`--docker`)
- `WANWU_DOCKER_REQUIRE=1` to refuse nested-overlay fallback (CI pure-docker gate)
- Code-OSS branded Wanwu IDE shell scripts + builtin extension install
- Packaging: VSIX + CLI single-file bundle; GitHub Release workflow on `v*` tags
- `docs/EPIC2_BACKLOG.md` — next epic prioritized on **E2-A Native Agent**

### Known limitations
- Real Grok binary optional; mock ACP covers local CI smoke
- Nested Docker/overlay hosts may fall back to local runner unless `WANWU_DOCKER_REQUIRE=1`
- VS Marketplace / Open VSX publishing not included in this beta
- Native platform installers and deep grok-build vendor are Post-beta (see Epic 2)

## 0.1.0 — 2026-08-10

Internal development milestone (superseded by 1.0.0-beta numbering for the public pre-release).
