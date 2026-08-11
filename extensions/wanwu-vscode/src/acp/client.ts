/**
 * Thin re-export — implementation lives in `@wanwu/acp-client`.
 * VS Code extension keeps a stable import path for existing modules/tests.
 */
export {
  AcpClient,
  type AcpClientOptions,
  type AcpEditProposal,
  type AcpPermissionRequest,
} from "@wanwu/acp-client";
