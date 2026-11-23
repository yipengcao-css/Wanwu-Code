/** Pull YAML frontmatter `description` / `name` when present. */
export function parseSkillFrontmatter(body: string): { name?: string; description?: string } {
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const block = m[1] ?? "";
  const out: { name?: string; description?: string } = {};
  for (const line of block.split("\n")) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    let val = kv[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key === "name") out.name = val;
    if (key === "description") out.description = val;
  }
  return out;
}

export function firstSummaryLine(body: string): string {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("---")) continue;
    if (/^(name|description|license|metadata|author|version):/i.test(line)) continue;
    return line.replace(/^#+\s*/, "").replace(/^["']|["']$/g, "").slice(0, 120);
  }
  return "";
}