import type { ToolSpec } from "@wanwu/providers";

/** OpenAI-compat tool definitions for wanwu-native tools. */
export const WANWU_TOOL_SPECS: ToolSpec[] = [
  {
    name: "Read",
    description:
      "Read a UTF-8 text file inside the workspace. Output is line-numbered (NNNNNN|text). Use offset/limit for large files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path from workspace root" },
        offset: { type: "number", description: "1-based start line (optional pagination)" },
        limit: { type: "number", description: "Max lines to return (default 200 when offset/limit set)" },
      },
      required: ["path"],
    },
  },
  {
    name: "ListDir",
    description:
      "List files and subdirectories in a folder (gitignore-style skips node_modules/.git). Prefer this over Glob **/* or Bash ls for exploration.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative directory (default .)" },
        depth: { type: "number", description: "How many levels to recurse (1-4, default 1)" },
      },
    },
  },
  {
    name: "Glob",
    description: "List files matching a glob pattern under the workspace.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern, e.g. **/*.md" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "Grep",
    description: "Search file contents for a regex/string pattern.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        glob: { type: "string", description: "Optional file glob filter" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "Edit",
    description:
      "Make targeted edits to an existing file via exact search/replace blocks. old_string must match the file content exactly and be unique (add surrounding context). Use replace_all for renames. For new files or full rewrites, use Write.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path from workspace root" },
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              old_string: { type: "string", description: "Exact text to find (must be unique unless replace_all)" },
              new_string: { type: "string", description: "Replacement text" },
              replace_all: { type: "boolean", description: "Replace every occurrence" },
            },
            required: ["old_string", "new_string"],
          },
        },
      },
      required: ["path", "edits"],
    },
  },
  {
    name: "Write",
    description:
      "Create a new file or overwrite an existing file with full contents (Agent mode only). Prefer Edit for targeted changes to existing files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path from workspace root" },
        content: { type: "string", description: "Full new file contents" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "Bash",
    description: "Run a shell command in the workspace (subject to deny-first permissions).",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
      },
      required: ["command"],
    },
  },
  {
    name: "Diagnose",
    description:
      "Run the project's fast static checker (tsc --noEmit / cargo check / go vet / python compileall) and return errors. Use after edits to confirm nothing broke.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "SearchCodebase",
    description:
      "Semantic search over the workspace codebase (embeddings index; keyword fallback). Returns relevant code chunks with path:line refs. Prefer over Grep for conceptual questions like 'where is auth handled'.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language or identifier query" },
        limit: { type: "number", description: "Max chunks (default 8)" },
      },
      required: ["query"],
    },
  },
  {
    name: "Todo",
    description:
      "Track a multi-step task list for this session. Rewrite the whole list each call. Use it for any task with 3+ steps: mark the current step in_progress, completed when done.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "Task description" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
            },
            required: ["content", "status"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "WebFetch",
    description: "Fetch an http(s) URL and return its text content (HTML is stripped to text).",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "http(s) URL to fetch" },
      },
      required: ["url"],
    },
  },
  {
    name: "WebSearch",
    description:
      "Search the web (DuckDuckGo by default; WANWU_WEB_SEARCH_URL overrides the endpoint). Returns titles, URLs, snippets.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "Task",
    description:
      "Run isolated subagents in parallel. explore=read-only, plan=plan-only, coder=edit (propose-only).",
    parameters: {
      type: "object",
      properties: {
        agents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["explore", "coder", "plan"] },
              prompt: { type: "string" },
              name: { type: "string" },
            },
            required: ["kind", "prompt"],
          },
        },
        concurrency: { type: "number", description: "Max parallel subagents (1-4)" },
      },
      required: ["agents"],
    },
  },
];
