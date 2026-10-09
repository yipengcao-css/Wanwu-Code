import assert from "node:assert/strict";
import { outlineSymbols, symbolAtLine } from "./outline.ts";

const symbols = outlineSymbols(`
# Title

export class Box {
  constructor() {}
}

export function open() {}

const close = () => {};

def run():
    pass
`);

assert.deepEqual(
  symbols.map((s) => `${s.kind}:${s.name}:${s.line}`),
  ["heading:Title:2", "class:Box:4", "fn:open:8", "fn:close:10", "fn:run:12"],
);

assert.equal(symbolAtLine(symbols, 1), null);
assert.equal(symbolAtLine(symbols, 6)?.name, "Box");
assert.equal(symbolAtLine(symbols, 9)?.name, "open");

console.log("outline tests passed");
