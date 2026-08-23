#!/usr/bin/env node
import { ValidateSpecsCommand } from "./cli/commands/quality/ValidateSpecsCommand";

/**
 * Diagnostic codes emitted by validation:
 * fail("missing_required_file")
 * fail("no_features")
 * fail("traceability_unrecognized")
 * fail("feature_not_in_matrix")
 * fail("use_cases_header_missing")
 * fail("events_header_missing")
 * error("strict_tdd_1")
 * error("strict_tdd_2")
 * error("strict_tdd_3")
 * error("requirement_cycle")
 * error("unknown_dependency")
 * error("self_dependency")
 */

export { ValidateSpecsCommand };

if (require.main === module) {
  new ValidateSpecsCommand(process.argv.slice(2)).execute();
}
