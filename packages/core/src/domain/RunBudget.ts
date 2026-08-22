/**
 * A ceiling on what one run may spend (C1).
 *
 * ## Why this exists, and it is not a hypothetical
 *
 * The harness had `max_attempts` and nothing else. Fourteen requirements × 3
 * attempts × 1200 s is hours of wall-clock and an unbounded bill, and the third
 * real run ended because **the account hit its monthly limit** — the expensive
 * way to find out there was no ceiling of our own.
 *
 * ## Stopping cleanly is the whole point
 *
 * A run that dies halfway is worse than one that stops: the ledger is never
 * written, so `harness report` cannot say what the money bought, and `--resume`
 * has less to work from. So exhausting a budget is not an error — it ends the
 * run in the ordinary way, with the requirements that were never started marked
 * `skipped` and named, and the report emitted as usual.
 *
 * ## What is deliberately not here
 *
 * Tokens. An agent is any shell command and only the agent knows what it spent,
 * so the budget is wall-clock and a count — two things the harness can measure
 * without the agent's cooperation. A profile may *declare* a cost per run, and
 * the report will multiply it, but a declared number is an estimate wearing a
 * label that says so, never a measurement.
 */

export interface BudgetLimits {
  /** Wall-clock ceiling for the whole run. 0 means no limit. */
  readonly budgetSeconds?: number;
  /** How many requirements this run may attempt at all. 0 means no limit. */
  readonly maxRequirements?: number;
}

export interface BudgetState {
  /** `Date.now()` when the run started. */
  readonly startedAt: number;
  /** Requirements this run has already begun. */
  readonly started: number;
}

export const BUDGET_CODES = Object.freeze({
  TIME: "run_budget_seconds_exhausted",
  COUNT: "run_max_requirements_reached",
});

export interface BudgetVerdict {
  readonly stop: boolean;
  readonly code: string | null;
  /** One sentence, for the report and for the skipped requirements' reason. */
  readonly reason: string;
}

const KEEP_GOING: BudgetVerdict = Object.freeze({ stop: false, code: null, reason: "" });

/**
 * May the run start one more requirement?
 *
 * Asked **before** starting, never in the middle of one: interrupting an
 * attempt mid-flight would throw away the money already spent on it and leave
 * a worktree nobody asked for. The budget bounds what a run begins, not what it
 * abandons.
 */
export function budgetVerdict(
  limits: BudgetLimits,
  state: BudgetState,
  now: number
): BudgetVerdict {
  const maxRequirements = limits.maxRequirements ?? 0;
  if (maxRequirements > 0 && state.started >= maxRequirements) {
    return {
      stop: true,
      code: BUDGET_CODES.COUNT,
      reason:
        `--max-requirements ${maxRequirements} reached; ` +
        `${state.started} requirement(s) were attempted.`,
    };
  }

  const budgetSeconds = limits.budgetSeconds ?? 0;
  if (budgetSeconds > 0) {
    const spentMs = Math.max(0, now - state.startedAt);
    if (spentMs >= budgetSeconds * 1000) {
      return {
        stop: true,
        code: BUDGET_CODES.TIME,
        reason:
          `--budget-seconds ${budgetSeconds} exhausted after ` +
          `${Math.round(spentMs / 1000)}s; ${state.started} requirement(s) were attempted.`,
      };
    }
  }

  return KEEP_GOING;
}

/** Does this run have any ceiling at all? Used to keep the report honest. */
export function hasBudget(limits: BudgetLimits): boolean {
  return (limits.budgetSeconds ?? 0) > 0 || (limits.maxRequirements ?? 0) > 0;
}

/**
 * What the run is estimated to have cost, from the per-profile hints.
 *
 * `attemptLog[].profiles` records which role ran each attempt, so a hint of
 * "this profile costs about 0.35 a run" multiplies out. Returns `null` when no
 * profile in the run declared one — an estimate assembled from nothing is a
 * number that invites belief it has not earned.
 */
export function estimateRunCost(
  attemptProfiles: ReadonlyArray<readonly string[]>,
  costPerRunHint: Readonly<Record<string, number>>
): { total: number; covered: number; uncovered: number } | null {
  const hints = Object.keys(costPerRunHint || {});
  if (hints.length === 0) return null;

  let total = 0;
  let covered = 0;
  let uncovered = 0;
  for (const profiles of attemptProfiles) {
    for (const profile of profiles) {
      const hint = costPerRunHint[profile];
      if (typeof hint === "number" && Number.isFinite(hint)) {
        total += hint;
        covered += 1;
      } else {
        uncovered += 1;
      }
    }
  }
  return covered > 0 ? { total, covered, uncovered } : null;
}
