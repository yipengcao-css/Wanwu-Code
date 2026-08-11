import type { ToolSpec } from "@wanwu/providers";

/** OpenAI-compat tool definitions for wanwu-native tools. */
export const WANWU_TOOL_SPECS: ToolSpec[] = [
  {
    name: "Read",
    description: "Read a UTF-8 text file inside the workspace.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path from workspace root" },
      },
      required: ["path"],
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
    description: "Create or overwrite a file with new contents (Agent mode only).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
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
];
