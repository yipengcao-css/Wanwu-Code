export type SessionBindPlan = "use" | "load" | "create";

/**
 * The ACP child only keeps sessions in memory. A saved id must be loaded
 * after the process starts or restarts; a live id can be selected as-is.
 */
export function planSessionBind(
  requestedId: string | undefined,
  liveIds: ReadonlySet<string>,
): SessionBindPlan {
  const id = requestedId?.trim();
  if (!id) return "create";
  if (liveIds.has(id)) return "use";
  return "load";
}

export function isUnknownSessionError(message: string): boolean {
  return /unknown session/i.test(message);
}

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
