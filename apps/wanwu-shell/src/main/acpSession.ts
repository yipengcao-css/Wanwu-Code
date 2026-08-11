/**
 * Decide whether an existing ACP client/session must be torn down
 * before serving a new workspace root.
 */
export function shouldResetAcpSession(
  clientCwd: string | undefined,
  nextRoot: string | null | undefined,
): boolean {
  if (!nextRoot) return false;
  if (!clientCwd) return false;
  return pathNormalize(clientCwd) !== pathNormalize(nextRoot);
}

function pathNormalize(p: string): string {
  // Light normalize for cross-platform compare (trim trailing sep).
  return p.replace(/[\\/]+$/, "").toLowerCase();
}
