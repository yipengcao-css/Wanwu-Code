/**
 * How many model rounds one prompt may take.
 * A fixed cap stops long tasks too early. The default starts at `start` and
 * grows by `step` while the agent is still calling different tools, until `ceiling`.
 * `WANWU_AGENT_MAX_TURNS` is a hard cap. `WANWU_AGENT_TURN_CEILING` only raises the ceiling.
 */

export interface TurnBudget {
  start: number;
  ceiling: number;
  step: number;
}

export const DEFAULT_TURN_BUDGET: TurnBudget = {
  start: 40,
  ceiling: 120,
  step: 20,
};

function positiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.floor(n);
}

export function resolveTurnBudget(
  explicit?: number,
  env: NodeJS.ProcessEnv = process.env,
): TurnBudget {
  const hard = positiveInt(explicit) ?? positiveInt(env.WANWU_AGENT_MAX_TURNS);
  if (hard) return { start: hard, ceiling: hard, step: 0 };
  const ceiling = positiveInt(env.WANWU_AGENT_TURN_CEILING) ?? DEFAULT_TURN_BUDGET.ceiling;
  const start = Math.min(DEFAULT_TURN_BUDGET.start, ceiling);
  const room = Math.max(ceiling - start, 0);
  return {
    start,
    ceiling,
    step: room === 0 ? 0 : Math.min(DEFAULT_TURN_BUDGET.step, room),
  };
}

export function toolRoundSignature(
  calls: Array<{ name: string; arguments: string }> | undefined,
): string {
  if (!calls?.length) return "";
  return [...calls]
    .map((call) => `${call.name}\n${call.arguments}`)
    .sort()
    .join("\n---\n");
}

export function nextTurnLimit(opts: {
  turn: number;
  limit: number;
  budget: TurnBudget;
  signature: string;
  previousSignature: string;
  repeatCount: number;
}): { limit: number; repeatCount: number; extended: boolean; stalled: boolean } {
  const same = opts.signature !== "" && opts.signature === opts.previousSignature;
  const repeatCount = same ? opts.repeatCount + 1 : 0;
  // The same tool round three times in a row is a loop, not progress.
  const stalled = repeatCount >= 2;
  if (stalled) {
    return { limit: opts.limit, repeatCount, extended: false, stalled: true };
  }
  const stillWorking = opts.signature !== "";
  if (
    stillWorking &&
    opts.turn >= opts.limit &&
    opts.limit < opts.budget.ceiling &&
    opts.budget.step > 0
  ) {
    const limit = Math.min(opts.budget.ceiling, opts.limit + opts.budget.step);
    return { limit, repeatCount, extended: limit > opts.limit, stalled: false };
  }
  return { limit: opts.limit, repeatCount, extended: false, stalled: false };
}
