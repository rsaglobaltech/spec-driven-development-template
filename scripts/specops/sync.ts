/**
 * `specops sync` — re-export of the command and of the reconciliation policy
 * it applies.
 *
 * The command lives in `scripts/cli/commands/specops/SyncCommand`; what to do
 * with a file when both the pack and the project have changed it is domain
 * (`core/domain/Reconciliation`). Kept as one import site for the sync tests.
 */

import { SyncCommand } from "../cli/commands/specops/SyncCommand";

export {
  SyncCommand,
  parseArgs,
  buildExpandArgs,
  resolvePacks,
  reconcileFile,
} from "../cli/commands/specops/SyncCommand";

export {
  reconcile,
  CONFLICT_OUTCOMES,
  OUTCOME_LABEL,
  ReconcileOutcome,
  ReconcileDecision,
  ReconcileOptions,
  MergeFn,
} from "../../packages/core/src/domain/Reconciliation";

// This file is what the command registry spawns, so it stays the entry point.
if (require.main === module) {
  new SyncCommand(process.argv.slice(2)).execute();
}
