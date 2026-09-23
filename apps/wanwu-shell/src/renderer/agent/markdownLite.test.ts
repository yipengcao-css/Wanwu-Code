import assert from "node:assert/strict";
import { extractShellCommand, parseInlines, parseProse } from "./markdownLite.ts";

const blocks = parseProse("# 标题\n\n先看 [文档](https://example.com)。\n\n- 一项\n- `code`\n\n1. 第一步\n\n> 注意 **风险**\n");
assert.equal(blocks[0]?.type, "h");
assert.equal(blocks[1]?.type, "p");
assert.equal(blocks[2]?.type, "ul");
assert.equal(blocks[3]?.type, "ol");
assert.equal(blocks[4]?.type, "quote");

const inlines = parseInlines("见 [x](javascript:alert(1)) 与 [文档](https://example.com)");
assert.equal(inlines.some((p) => p.type === "link" && p.href.startsWith("javascript:")), false);
assert.ok(inlines.some((p) => p.type === "link" && p.href === "https://example.com"));

assert.equal(extractShellCommand("```bash\npnpm test\n```"), "pnpm test");
assert.equal(extractShellCommand("ls -la"), "ls -la");
assert.equal(extractShellCommand("可以运行：\nls -la"), "ls -la");

console.log("markdownLite tests passed");
