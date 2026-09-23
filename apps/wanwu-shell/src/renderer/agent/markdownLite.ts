export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "link"; text: string; href: string };

export type ProseBlock =
  | { type: "h"; level: 1 | 2 | 3; inlines: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "ol"; items: Inline[][] }
  | { type: "quote"; inlines: Inline[] }
  | { type: "p"; inlines: Inline[] };

function safeHref(href: string): string | undefined {
  const h = href.trim();
  if (/^https?:\/\//i.test(h) || /^mailto:/i.test(h)) return h;
  return undefined;
}

/** Inline markdown: code, bold, emphasis, http(s) links. No raw HTML. */
export function parseInlines(line: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(line))) {
    if (m.index > last) out.push({ type: "text", text: line.slice(last, m.index) });
    const token = m[0];
    if (token.startsWith("`")) {
      out.push({ type: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("**")) {
      out.push({ type: "strong", text: token.slice(2, -2) });
    } else if (token.startsWith("*")) {
      out.push({ type: "em", text: token.slice(1, -1) });
    } else {
      const lm = token.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
      const href = lm ? safeHref(lm[2]!) : undefined;
      if (lm && href) out.push({ type: "link", text: lm[1]!, href });
      else out.push({ type: "text", text: token });
    }
    last = m.index + token.length;
  }
  if (last < line.length) out.push({ type: "text", text: line.slice(last) });
  return out.length ? out : [{ type: "text", text: line }];
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/** Headings, lists, quotes, paragraphs. Code fences are stripped earlier. */
export function parseProse(text: string): ProseBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ProseBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isBlank(line)) {
      i += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "h",
        level: heading[1]!.length as 1 | 2 | 3,
        inlines: parseInlines(heading[2]!.trim()),
      });
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        parts.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", inlines: parseInlines(parts.join(" ")) });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push(parseInlines((lines[i] ?? "").replace(/^[-*]\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i] ?? "")) {
        items.push(parseInlines((lines[i] ?? "").replace(/^\d+[.)]\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      !isBlank(lines[i] ?? "") &&
      !/^(#{1,3})\s+/.test(lines[i] ?? "") &&
      !/^[-*]\s+/.test(lines[i] ?? "") &&
      !/^\d+[.)]\s+/.test(lines[i] ?? "") &&
      !/^>\s?/.test(lines[i] ?? "")
    ) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({ type: "p", inlines: parseInlines(para.join(" ")) });
  }
  return blocks;
}

/** Pull a shell command out of a model reply that may be fenced. */
export function extractShellCommand(text: string): string {
  const fence = text.match(/```(?:[^\n`]*)\n([\s\S]*?)```/);
  if (fence?.[1]?.trim()) return fence[1].trim();
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) ?? text).trim();
}
