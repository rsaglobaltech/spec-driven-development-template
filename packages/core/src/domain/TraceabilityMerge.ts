import { MergeFn, reconcile } from "./Reconciliation";
import { detectTraceabilityMode, readRowFields } from "./TraceabilityFormat";

/**
 * Merging two versions of `docs/specs/traceability.md`, row by row.
 *
 * ## Why this exists
 *
 * Run the harness with `--concurrency 3` and you get three green branches, each
 * having flipped **its own** requirement to `Implemented`. Merge the second one
 * and git reports a conflict in the matrix — even though no two branches touched
 * the same row.
 *
 * The reason is not concurrency. Git's three-way merge works on lines, and it
 * needs at least one *unchanged* line between two changed regions to treat them
 * as independent. Matrix rows are consecutive lines, so two edits one row apart
 * land in the same hunk. Measured: rows 1 and 2 conflict, rows 1 and 5 merge
 * clean. Same writers, same file, same concurrency — only the distance differs.
 *
 * So the fix is not a lock (there is no race: every worker writes its own
 * worktree) and not a different diff algorithm (myers, patience, histogram and
 * minimal all conflict). The fix is to merge the file in the unit it is actually
 * made of: rows.
 *
 * ## How a row is identified
 *
 * By `Requirement` + `Scenario ID`, and **never** by anything that changes.
 *
 * That is not a stylistic preference, it is the bug that nearly shipped: a first
 * prototype keyed rows on the first two cells of a two-column test table, where
 * the second cell *was* the status. A row whose status had changed then looked
 * like a *different* row, the merge came out "clean", and the other branch's
 * edit was lost in silence. A merge that loses an edit is worse than one that
 * refuses, so the key is the pair of columns that a status flip never touches.
 *
 * ## What it will and will not do
 *
 * It resolves the case it was built for — two branches, two different rows — and
 * it still **conflicts** when two branches change the same row to different
 * values. Losing an edit quietly is the one outcome worse than a conflict, so
 * anything genuinely ambiguous comes back with markers for a human.
 *
 * The per-row decision is not reimplemented here: it is `reconcile`, the same
 * function `specops sync` uses to decide what to do when a pack and a project
 * have both changed a file. Identical question, one granularity down.
 */

/** Conflict markers, in git's own shape so existing tooling recognises them. */
const OURS_MARK = "<<<<<<<";
const SPLIT_MARK = "=======";
const THEIRS_MARK = ">>>>>>>";

export interface MatrixMergeResult {
  /** The merged file, with conflict markers around any row that needed a human. */
  content: string;
  /** Rows that could not be resolved, by `REQ::SCN` key. Empty means a clean merge. */
  conflicts: string[];
}

/**
 * A row key that a status flip cannot change.
 *
 * `parseMatrixRows` splits on `|`, which leaves an empty cell at each end, so
 * `cells[1]` is the first column. `readRowFields` owns that offset for both
 * matrix shapes; going through it means this module never learns the layout.
 */
function rowKey(line: string, mode: "rich" | "legacy"): string | null {
  const cells = line.split("|").map((c) => c.trim());
  const { requirementId, scenarioId } = readRowFields(cells, mode);
  const key = `${requirementId}::${scenarioId}`;
  return key === "::" ? null : key;
}

/** Every data row of a matrix, keyed and in file order. */
function indexRows(content: string, mode: "rich" | "legacy"): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of content.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    if (line.includes("---")) continue;
    const key = rowKey(line, mode);
    if (key) rows.set(key, line);
  }
  return rows;
}

/**
 * A row both sides changed differently is a conflict, full stop.
 *
 * `reconcile` takes a merge function for the case where base, ours and theirs
 * all differ. One row is a single fact — a status is `Implemented` or it is
 * `Verified`, there is no blend — so this always reports a conflict and lets
 * `reconcile` produce the outcome.
 */
const rowsDoNotBlend: MergeFn = () => ({ merged: "", conflict: true });

/**
 * Three-way merge of a traceability matrix.
 *
 * @param base   the common ancestor's content, or "" when git has none
 * @param ours   the version being merged into
 * @param theirs the version being merged in
 */
export function mergeTraceability(base: string, ours: string, theirs: string): MatrixMergeResult {
  // The mode comes from `ours`: git is merging *into* that file, and a merge is
  // not the place to convert a project between matrix shapes. A file with
  // neither header has no rows to key, so the whole merge is handed back
  // unresolved rather than guessed at.
  const mode = detectTraceabilityMode(ours);
  if (mode === null) {
    return { content: ours, conflicts: ["(traceability.md has no recognisable matrix header)"] };
  }

  const baseRows = indexRows(base, mode);
  const ourRows = indexRows(ours, mode);
  const theirRows = indexRows(theirs, mode);

  const conflicts: string[] = [];
  const emitted = new Set<string>();
  const out: string[] = [];

  for (const line of ours.split("\n")) {
    const key = line.trim().startsWith("|") && !line.includes("---") ? rowKey(line, mode) : null;
    if (!key) {
      out.push(line); // header, separator, prose — carried through untouched
      continue;
    }
    emitted.add(key);

    const ourRow = ourRows.get(key) ?? line;
    const baseRow = baseRows.get(key) ?? null;
    const theirRow = theirRows.get(key);

    if (theirRow === undefined) {
      // They do not have this row. Either we added it, or they deleted it.
      if (baseRow === null || baseRow === ourRow) {
        // We added it (no base), or they deleted a row we left alone. Keeping
        // ours in the first case is right; in the second, honouring a deletion
        // would drop a requirement during a merge, which is a decision no
        // driver should make silently — so the row stays and `validate` on the
        // result is what tells the truth.
        out.push(ourRow);
      } else {
        // We changed it, they deleted it. Nothing here can be right by itself.
        conflicts.push(key);
        out.push(conflictBlock(ourRow, "(row deleted on the other side)"));
      }
      continue;
    }

    const decision = reconcile(baseRow, ourRow, theirRow, {}, rowsDoNotBlend);
    if (decision.outcome === "conflict" || decision.outcome === "conflict-no-base") {
      conflicts.push(key);
      out.push(conflictBlock(ourRow, theirRow));
      continue;
    }
    // `write === null` means "leave ours alone" — unchanged, or their side did
    // not move. Anything else is the row to take.
    out.push(decision.write ?? ourRow);
  }

  // Rows only they have. Appended after the last row rather than interleaved:
  // the matrix has no total order the driver could honour, and inventing one
  // would reshuffle a file nobody asked to reshuffle. `specgate req` owns ordering.
  const added = [...theirRows].filter(([key]) => !emitted.has(key)).map(([, line]) => line);
  if (added.length > 0) {
    const lastRow = lastRowIndex(out, mode);
    out.splice(lastRow + 1, 0, ...added);
  }

  return { content: out.join("\n"), conflicts };
}

/** Where the final data row sits, so appended rows land inside the table. */
function lastRowIndex(lines: readonly string[], mode: "rich" | "legacy"): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.trim().startsWith("|") && !line.includes("---") && rowKey(line, mode)) return i;
  }
  return lines.length - 1;
}

/**
 * One row, both versions, in git's marker shape.
 *
 * **How to resolve one of these by hand:** the two lines are the same row as the
 * two branches left it. Delete the three marker lines and the version you do not
 * want, keeping exactly one row. Then run `specgate validate <project>` — it checks
 * the statuses are legal and that no scenario id is duplicated, which is what
 * catches a half-finished resolution. Do not keep both lines: a duplicated
 * requirement is the one shape of corruption this file must never have.
 */
function conflictBlock(ourRow: string, theirRow: string): string {
  return [`${OURS_MARK} ours`, ourRow, SPLIT_MARK, theirRow, `${THEIRS_MARK} theirs`].join("\n");
}
