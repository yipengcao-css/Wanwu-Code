export type OutlineKind = "heading" | "class" | "fn";

export type OutlineSymbol = {
  name: string;
  line: number;
  kind: OutlineKind;
};

const MOD = "(?:export|default|pub|public|private|protected|async|static|abstract|override|unsafe|const)\\s+";

const RULES: Array<{ kind: OutlineKind; re: RegExp }> = [
  { kind: "heading", re: /^#{1,6}\s+(.+?)\s*#*\s*$/ },
  {
    kind: "class",
    re: new RegExp(`^(?:${MOD})*(?:abstract\\s+)?(?:class|interface|enum|struct|trait|type)\\s+([A-Za-z_][\\w]*)`),
  },
  {
    kind: "fn",
    re: new RegExp(`^(?:${MOD})*(?:async\\s+)?(?:function|fn|func|def)\\s+([A-Za-z_][\\w]*)`),
  },
  {
    kind: "fn",
    re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_][\w]*)\s*=>/,
  },
];

/** Control-flow and keywords that look like `name(` but are not methods. */
const NOT_METHOD = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "with",
  "return",
  "throw",
  "new",
  "super",
  "import",
  "from",
  "typeof",
  "instanceof",
  "await",
  "yield",
  "else",
  "do",
  "try",
  "case",
  "delete",
  "void",
  "in",
  "of",
  "function",
  "fn",
  "func",
  "def",
  "class",
]);

const METHOD_MOD =
  "(?:public|private|protected|pub|static|async|override|abstract|virtual|final|export|default|readonly|get|set)\\s+";
const METHOD_RE = new RegExp(
  `^(?:${METHOD_MOD})*(?:async\\s+)?(?:[A-Za-z_][\\w.]*\\s+)?([A-Za-z_][\\w]*)\\s*(?:<[^>]*>)?\\s*\\(`,
);

/** Headings and declarations, in file order. One symbol per line. */
export function outlineSymbols(text: string): OutlineSymbol[] {
  const out: OutlineSymbol[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && out.length < 80; i += 1) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    let matched = false;
    for (const rule of RULES) {
      const match = rule.re.exec(trimmed);
      const name = match?.[1]?.trim();
      if (!name) continue;
      out.push({ name, line: i + 1, kind: rule.kind });
      matched = true;
      break;
    }
    if (matched) continue;
    if (raw.length === trimmed.length) continue;
    const method = METHOD_RE.exec(trimmed);
    const name = method?.[1]?.trim();
    if (!name || NOT_METHOD.has(name)) continue;
    out.push({ name, line: i + 1, kind: "fn" });
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
