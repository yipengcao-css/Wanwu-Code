import { readFileSync } from "node:fs";
import type { WanwuMode } from "@wanwu/config";
import { discoverMemory } from "../memory.js";
import { peekMcpRegistry } from "../mcp/registry.js";
import { discoverRules, renderRulesForPrompt } from "../rules.js";
import { discoverSkills, renderSkillsForPrompt } from "../skills.js";
import type { AgentContext } from "./agentLoop.js";

export interface EditorContext {
  activePath?: string;
  openTabs: string[];
}

const EDITOR_BLOCK = /\[EDITOR_CONTEXT\]([\s\S]*?)\[\/EDITOR_CONTEXT\]/;

/** Pull host-injected editor context out of the user prompt (keep the block in-place). */
export function parseEditorContext(prompt: string): EditorContext {
  const m = prompt.match(EDITOR_BLOCK);
  if (!m) return { openTabs: [] };
  const body = m[1] ?? "";
  const activePath =
    body.match(/Active file:\s*(.+)/i)?.[1]?.trim() ||
    body.match(/Open file:\s*(.+)/i)?.[1]?.trim();
  const tabsLine = body.match(/Open tabs:\s*(.+)/i)?.[1] ?? "";
  const openTabs = tabsLine
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (activePath && !openTabs.includes(activePath)) openTabs.unshift(activePath);
  return { activePath, openTabs };
}

export function buildSystem(
  ctx: AgentContext,
  mode: WanwuMode,
  activeFiles: string[] = [],
  editor: EditorContext = { openTabs: [] },
): string {
  const memory = discoverMemory(ctx.workspaceRoot)
    .slice(0, 2)
    .map((f) => {
      try {
        return readFileSync(f.path, "utf8").slice(0, 1200);
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n---\n");

  const mcpReg = peekMcpRegistry(ctx.workspaceRoot);
  const mcpNames = mcpReg
    ?.listTools()
    .map((t) => t.qualifiedName)
    .slice(0, 40);
  const mcpResources = mcpReg
    ?.listResources()
    .slice(0, 20)
    .map((r) => `${r.uri}${r.name ? ` (${r.name})` : ""}`);
  const skills = renderSkillsForPrompt(discoverSkills(ctx.workspaceRoot));
  const rules = renderRulesForPrompt(discoverRules(ctx.workspaceRoot), [
    ...activeFiles,
    ...editor.openTabs,
  ]);

  const editorLines: string[] = [];
  if (editor.activePath) editorLines.push(`Active file: ${editor.activePath}`);
  if (editor.openTabs.length) editorLines.push(`Open editors: ${editor.openTabs.join(", ")}`);

  return [
    "You are Wanwu, a local coding agent (Cursor-style). Use tools for workspace facts; do not guess file contents.",
    [
      "Exploration: ListDir for a folder, then Read/Glob/Grep. Prefer SearchCodebase for conceptual questions.",
      "Read large files with offset/limit. Issue independent Reads/Greps together when useful.",
      "Editing: Read first. Edit uses unique old_string/new_string blocks; Write only for new files or full rewrites.",
      "After edits: Diagnose (or project tests). Do not claim done until checks pass or you explain why they cannot run.",
      "Todo for 3+ steps. Task subagents for parallel explore/plan. WebSearch/WebFetch only for fresh public info.",
      "Be concise. If you hit a turn limit, summarize progress and remaining work.",
    ].join(" "),
    `Workspace: ${ctx.workspaceRoot}`,
    `Mode: ${mode}`,
    mode === "plan" || mode === "ask"
      ? "Do NOT use Edit/Write. Avoid destructive Bash."
      : "You may Edit/Write/Bash when needed (permissions still apply). User can undo the turn via checkpoint.",
    editorLines.length ? `Editor context:\n${editorLines.join("\n")}` : "",
    mcpNames?.length
      ? `MCP tools available (namespaced mcp__server__tool): ${mcpNames.join(", ")}`
      : "",
    mcpResources?.length
      ? `MCP resources (use McpReadResource with uri): ${mcpResources.join(", ")}`
      : "",
    skills ? `Project skills:\n${skills}` : "",
    rules ? `Project rules:\n${rules}` : "",
    memory ? `Project memory:\n${memory}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
