import assert from "node:assert/strict";
import { outlineSymbols, symbolAtLine } from "./outline.ts";

const symbols = outlineSymbols(`
# Title

export class Box {
  constructor() {}
  open() {}
  async close() {}
  if (ready) {}
}

export function greet() {}

const close = () => {};

pub fn build() {}

def run():
    pass
`);

assert.deepEqual(
  symbols.map((s) => `${s.kind}:${s.name}:${s.line}`),
  [
    "heading:Title:2",
    "class:Box:4",
    "fn:constructor:5",
    "fn:open:6",
    "fn:close:7",
    "fn:greet:11",
    "fn:close:13",
    "fn:build:15",
    "fn:run:17",
  ],
);

assert.equal(symbolAtLine(symbols, 1), null);
assert.equal(symbolAtLine(symbols, 4)?.name, "Box");
assert.equal(symbolAtLine(symbols, 6)?.name, "open");
assert.equal(symbolAtLine(symbols, 8)?.name, "close");
assert.equal(symbolAtLine(symbols, 12)?.name, "greet");

console.log("outline tests passed");
