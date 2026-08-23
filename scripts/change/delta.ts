import { DeltaSpec } from "../../packages/core/src/domain/DeltaSpec";

/**
 * Delta diagnostics codes:
 * error("no_rfc2119_keyword")
 * error("scenario_not_gherkin")
 * error("delta_unknown_section")
 * error("delta_empty")
 * error("duplicate_requirement")
 */

export function validateDelta(deltaSource: string, opts?: any) {
  return DeltaSpec.validate(deltaSource, opts);
}

export function applyDelta(specSource: string | null, deltaSource: string, opts?: any) {
  return DeltaSpec.apply(specSource, deltaSource, opts);
}
