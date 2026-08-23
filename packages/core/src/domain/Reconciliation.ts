/**
 * What `specops sync` does with one file when the pack has moved on.
 *
 * The hard case is the ordinary one: the pack changed a file and so did the
 * project. Sync therefore keeps a baseline — the content the pack last wrote —
 * and treats the three-way comparison as the primary decision rather than a
 * fallback. Without a baseline it refuses to guess, because silently choosing
 * a side is how a local edit disappears without anyone noticing.
 *
 * Pure: the contents arrive as strings and the outcome says what to write.
 * Reading them, running `git merge-file`, and writing the result are the
 * caller's, so every branch below is testable without a filesystem.
 */

export type ReconcileOutcome =
  | "added"
  | "unchanged"
  | "updated"
  | "overwritten"
  | "kept"
  | "merged"
  | "conflict"
  | "conflict-skipped"
  | "conflict-no-base";

/** The outcomes a human has to resolve by hand. */
export const CONFLICT_OUTCOMES: ReadonlySet<ReconcileOutcome> = new Set<ReconcileOutcome>([
  "conflict",
  "conflict-skipped",
  "conflict-no-base",
]);

/** How each outcome is named in the per-pack summary. */
export const OUTCOME_LABEL: Readonly<Record<ReconcileOutcome, string>> = {
  added: "added",
  unchanged: "unchanged",
  updated: "updated",
  overwritten: "overwritten",
  kept: "kept (local edits preserved)",
  merged: "merged",
  conflict: "CONFLICT (markers written)",
  "conflict-skipped": "CONFLICT (skipped)",
  "conflict-no-base": "CONFLICT (no merge base)",
};

export interface ReconcileDecision {
  outcome: ReconcileOutcome;
  /** What to write to the project, or null to leave the file as it is. */
  write: string | null;
  /** What to record as the new baseline, or null to leave the baseline alone. */
  baselineContent: string | null;
}

export interface ReconcileOptions {
  /** Take the pack's version without asking. */
  force?: boolean;
  /** Leave conflicting files untouched instead of writing merge markers. */
  abortOnConflict?: boolean;
}

/** A three-way merge; `git merge-file` in practice. */
export type MergeFn = (
  base: string,
  local: string,
  incoming: string
) => { merged: string; conflict: boolean };

/**
 * @param base     what the pack wrote last time, or null if never recorded
 * @param local    what the project has now, or null if the file does not exist
 * @param incoming what the pack writes this time
 */
export function reconcile(
  base: string | null,
  local: string | null,
  incoming: string,
  opts: ReconcileOptions,
  merge: MergeFn
): ReconcileDecision {
  if (local === null) {
    return { outcome: "added", write: incoming, baselineContent: incoming };
  }
  if (local === incoming) {
    return { outcome: "unchanged", write: null, baselineContent: incoming };
  }
  if (opts.force) {
    return { outcome: "overwritten", write: incoming, baselineContent: incoming };
  }
  if (base === null) {
    // No merge base recorded — refuse to guess. Leave local untouched.
    return { outcome: "conflict-no-base", write: null, baselineContent: null };
  }
  if (local === base) {
    return { outcome: "updated", write: incoming, baselineContent: incoming };
  }
  if (incoming === base) {
    // Pack unchanged for this file; local edits stand.
    return { outcome: "kept", write: null, baselineContent: base };
  }

  // Both sides diverged from base — real three-way merge.
  const result = merge(base, local, incoming);
  if (!result.conflict) {
    return { outcome: "merged", write: result.merged, baselineContent: incoming };
  }
  if (opts.abortOnConflict) {
    return { outcome: "conflict-skipped", write: null, baselineContent: base };
  }
  return { outcome: "conflict", write: result.merged, baselineContent: base };
}
