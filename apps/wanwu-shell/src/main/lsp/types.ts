export type LspSeverity = "error" | "warning" | "info" | "hint";

export type LspDiagnostic = {
  message: string;
  severity: LspSeverity;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  source?: string;
  code?: string | number;
};

export type LspDiagnosticsPayload = {
  /** Workspace-relative path using `/` separators */
  path: string;
  uri: string;
  diagnostics: LspDiagnostic[];
};

export type LspLaunchPlan = {
  command: string;
  args: string[];
};

export type LspServerDef = {
  id: string;
  command: string;
  args: string[];
  /** LSP languageIds this server handles */
  languages: string[];
  /** Optional env for the spawned server */
  env?: Record<string, string>;
  /** If true, only used when explicitly enabled in workspace config */
  optIn?: boolean;
};
