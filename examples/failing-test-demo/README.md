# failing-test-demo

端到端演示工程：`sum` 故意算错，测试失败。

Phase 7 剧本：

1. Wanwu Plan 生成修复计划
2. Act 修改 `src/sum.js`
3. Verify 跑 `pnpm test` 转绿
4. 生成 commit message（不自动 push）

当前可手动确认失败：

```bash
pnpm --filter @wanwu/failing-test-demo run test:demo
```
