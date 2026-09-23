import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ShellSkill = {
  id: string;
  name: string;
  source: "workspace" | "agents" | "user";
  summary: string;
};

function summaryOf(body: string, fallback: string): string {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("---")) continue;
    if (/^(name|description|license|metadata|author|version):/i.test(line)) continue;
    return line.replace(/^#+\s*/, "").replace(/^["']|["']$/g, "").slice(0, 80);
  }
  return fallback;
}

function listFlat(dir: string, source: ShellSkill["source"]): ShellSkill[] {
  if (!existsSync(dir)) return [];
  const out: ShellSkill[] = [];
  for (const name of readdirSync(dir)) {
    if (!(name.endsWith(".md") || name.endsWith(".toml"))) continue;
    try {
      const body = readFileSync(join(dir, name), "utf8");
      if (!body.trim()) continue;
      const stem = name.replace(/\.(md|toml)$/i, "");
      out.push({ id: `${source}/${stem}`, name: stem, source, summary: summaryOf(body, stem) });
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

function listAgents(dir: string): ShellSkill[] {
  if (!existsSync(dir)) return [];
  const out: ShellSkill[] = [];
  for (const name of readdirSync(dir)) {
    const folder = join(dir, name);
    try {
      if (!statSync(folder).isDirectory()) continue;
      const body = readFileSync(join(folder, "SKILL.md"), "utf8");
      if (!body.trim()) continue;
      out.push({
        id: `agents/${name}`,
        name,
        source: "agents",
        summary: summaryOf(body, name),
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

export function listWorkspaceSkills(root: string | null, userHome = homedir()): ShellSkill[] {
  return [
    ...(root ? listFlat(join(root, ".wanwu", "skills"), "workspace") : []),
    ...(root ? listAgents(join(root, ".agents", "skills")) : []),
    ...listFlat(join(userHome, ".wanwu", "skills"), "user"),
  ].slice(0, 48);
}
