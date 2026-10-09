export type OutlineKind = "heading" | "class" | "fn";

export type OutlineSymbol = {
  name: string;
  line: number;
  kind: OutlineKind;
};

const RULES: Array<{ kind: OutlineKind; re: RegExp }> = [
  { kind: "heading", re: /^#{1,6}\s+(.+?)\s*#*\s*$/ },
  {
    kind: "class",
    re: /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:class|interface|enum|struct|trait|type)\s+([A-Za-z_][\w]*)/,
  },
  { kind: "fn", re: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|fn|func|def)\s+([A-Za-z_][\w]*)/ },
  {
    kind: "fn",
    re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_][\w]*)\s*=>/,
  },
];

/** Headings and declarations, in file order. One symbol per line. */
export function outlineSymbols(text: string): OutlineSymbol[] {
  const out: OutlineSymbol[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && out.length < 80; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    for (const rule of RULES) {
      const match = rule.re.exec(trimmed);
      const name = match?.[1]?.trim();
      if (!name) continue;
      out.push({ name, line: i + 1, kind: rule.kind });
      break;
    }
  }
  return out;
}

/** The declaration that contains this 1-based line, if the file has one. */
export function symbolAtLine(symbols: OutlineSymbol[], line: number): OutlineSymbol | null {
  let current: OutlineSymbol | null = null;
  for (const symbol of symbols) {
    if (symbol.line > line) break;
    current = symbol;
  }
  return current;
}
