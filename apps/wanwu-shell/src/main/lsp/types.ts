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
