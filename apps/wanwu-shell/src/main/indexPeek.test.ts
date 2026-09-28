import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { peekIndex, queryFromPrefix } from "./indexPeek.ts";

const root = mkdtempSync(join(tmpdir(), "wanwu-peek-"));
mkdirSync(join(root, ".wanwu", "index"), { recursive: true });
writeFileSync(
  join(root, ".wanwu", "index", "codebase.json"),
  JSON.stringify({
    version: 1,
    mode: "keyword",
    updatedAt: "t",
    files: {
      "src/auth.ts": {
        chunks: [
          {
            startLine: 10,
            endLine: 18,
            text: "export function checkSession(token) { return token }",
            tokens: ["export", "function", "checksession", "token", "return"],
          },
        ],
      },
    },
  }),
);

assert.equal(queryFromPrefix("const token = checkSession("), "const token checkSession");
const hit = peekIndex(root, "checkSession token");
assert.match(hit, /src\/auth\.ts:10/);
assert.equal(peekIndex(root, ""), "");

const bare = mkdtempSync(join(tmpdir(), "wanwu-peek-"));
mkdirSync(join(bare, ".wanwu", "index"), { recursive: true });
writeFileSync(
  join(bare, ".wanwu", "index", "codebase.json"),
  JSON.stringify({
    version: 1,
    files: {
      "src/auth.ts": {
        chunks: [{ startLine: 4, text: "export function checkSession(token) { return token }", tokens: [] }],
      },
    },
  }),
);
assert.match(peekIndex(bare, "checkSession"), /src\/auth\.ts:4/);
console.log("indexPeek tests passed");
