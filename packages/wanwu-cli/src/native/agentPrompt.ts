import { readFileSync } from "node:fs";
import type { WanwuMode } from "@wanwu/config";
import { discoverMemory } from "../memory.js";
import { peekMcpRegistry } from "../mcp/registry.js";
import { discoverRules, renderRulesForPrompt } from "../rules.js";
import { renderSkillsForPrompt, resolvePromptSkills, type SkillFile } from "../skills.js";
import type { AgentContext } from "./agentLoop.js";

export interface EditorSelection {
  path?: string;
  startLine?: number;
  endLine?: number;
  text: string;
}

export interface EditorContext {
  activePath?: string;
  openTabs: string[];
  selection?: EditorSelection;
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

  const selHead = body.match(/Selection(?:\s+\(([^)]+)\))?:/i);
  let selection: EditorSelection | undefined;
  if (selHead) {
    const loc = selHead[1] ?? "";
    const locMatch = loc.match(/^(.+):(\d+)-(\d+)$/);
    const fence = body.slice(body.indexOf(selHead[0]) + selHead[0].length);
    const code = fence.match(/```(?:\w*)\n([\s\S]*?)```/)?.[1] ?? fence.trim();
    if (code.trim()) {
      selection = {
        path: locMatch?.[1],
        startLine: locMatch ? Number(locMatch[2]) : undefined,
        endLine: locMatch ? Number(locMatch[3]) : undefined,
        text: code.replace(/\n$/, ""),
      };
    }
  }

  return { activePath, openTabs, selection };
}

export function buildSystem(
  ctx: AgentContext,
  mode: WanwuMode,
  activeFiles: string[] = [],
  editor: EditorContext = { openTabs: [] },
  prompt = "",
  selectedSkills?: SkillFile[],
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
  const skillFiles = selectedSkills ?? resolvePromptSkills(ctx.workspaceRoot, prompt);
  const skills = renderSkillsForPrompt(skillFiles);
  const rules = renderRulesForPrompt(discoverRules(ctx.workspaceRoot), [
    ...activeFiles,
    ...editor.openTabs,
  ]);

  const editorLines: string[] = [];
  if (editor.activePath) editorLines.push(`Active file: ${editor.activePath}`);
  if (editor.openTabs.length) editorLines.push(`Open editors: ${editor.openTabs.join(", ")}`);
  if (editor.selection?.text) {
    const loc =
      editor.selection.path != null
        ? `${editor.selection.path}${
            editor.selection.startLine != null
              ? `:${editor.selection.startLine}-${editor.selection.endLine ?? editor.selection.startLine}`
              : ""
          }`
        : "";
    editorLines.push(`Current selection${loc ? ` (${loc})` : ""}:`);
    editorLines.push(editor.selection.text.slice(0, 4000));
  }

  const modeGuide =
    mode === "ask"
      ? "Ask mode: answer with read-only tools only (Read/ListDir/Glob/Grep/SearchCodebase/Diagnose/Web*/Browser). Never edit or run a shell."
      : mode === "plan"
        ? "Plan mode: explore with read-only tools, then output a markdown plan (任务理解 / 涉及文件 / 实施步骤 / 验证 / 风险). Do NOT implement. The user will approve and switch to Agent."
        : mode === "verify"
          ? "Verify mode: inspect recent changes with Diagnose/Read. Do not add features."
          : mode === "debug"
            ? [
                "Debug mode: do NOT jump to a product fix.",
                "1) State 2-4 hypotheses with the Debug tool (phase=hypotheses).",
                "2) Add temporary instrumentation via Edit; every added log/line must contain the token WANWU_DEBUG.",
                "3) Call Debug phase=wait_for_repro and STOP. Ask the user to reproduce and paste logs.",
                "4) After they reply: Debug phase=analyze, then a targeted fix, then Debug phase=cleanup and delete every WANWU_DEBUG line.",
                "Never leave instrumentation in the final change. This is not a DAP debugger.",
              ].join(" ")
            : "Agent mode: you may Edit/Write/Bash when needed (permissions still apply). User can undo this turn via checkpoint.";

  return [
    "You are Wanwu, a local coding agent (Cursor-style). Use tools for workspace facts; do not guess file contents.",
    [
      "Exploration: ListDir for a folder, then Read/Glob/Grep. Prefer SearchCodebase for conceptual questions.",
      "Read large files with offset/limit. Issue independent Reads/Greps together when useful.",
      "Editing: Read first. Edit uses unique old_string/new_string blocks; Write only for new files or full rewrites.",
      "After edits: Diagnose (or project tests). Do not claim done until checks pass or you explain why they cannot run.",
      "Todo for 3+ steps. Task subagents for parallel explore/plan. WebSearch/WebFetch only for fresh public info.",
      "Be concise. If you hit a turn limit, summarize progress and remaining work.",
      "Do not paste full files or long patches in the chat. Use Read/Edit/Write; in chat cite paths and a one-line change.",
      "Put brief planning in <think>...</think>. After </think>, write the user-visible answer only.",
    ].join(" "),
    `Workspace: ${ctx.workspaceRoot}`,
    `Mode: ${mode}`,
    modeGuide,
    editorLines.length ? `Editor context:\n${editorLines.join("\n")}` : "",
    mcpNames?.length
      ? `MCP tools available (namespaced mcp__server__tool): ${mcpNames.join(", ")}`
      : "",
    mcpResources?.length
      ? `MCP resources (use McpReadResource with uri): ${mcpResources.join(", ")}`
      : "",
    skills
      ? `Attached skills (read and apply at the start of every task, in order):\n${skills}`
      : "",
    rules ? `Project rules:\n${rules}` : "",
    memory ? `Project memory:\n${memory}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
