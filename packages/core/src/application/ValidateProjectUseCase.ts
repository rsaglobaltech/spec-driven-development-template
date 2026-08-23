import { ValidationReport } from "../domain/ValidationReport";
import { ITraceabilityRepository } from "./ports/ITraceabilityRepository";
import {
  ALLOWED_STATUS,
  LEGACY_HEADER,
  POST_DRAFT_STATUS,
  RICH_HEADER,
  TraceabilityMode,
  detectTraceabilityMode,
  parseMatrixRows,
  readRowFields,
} from "../domain/TraceabilityFormat";

export interface ValidateProjectOptions {
  strictTdd?: boolean;
  /** `spec.md`, needed only by the strict-TDD check that every REQ it names has a row. */
  specContent?: string | null;
}

export interface ValidateMatrixResult {
  report: ValidationReport;
  /** The matrix shape that was found, so callers can branch on it as before. */
  mode: TraceabilityMode | null;
  /** Every requirement id the matrix carries a row for. */
  requirements: Set<string>;
}

/**
 * Everything `validate` checks about the traceability matrix itself.
 *
 * The file checks around it — required files, unresolved placeholders, feature
 * files, the monorepo fan-out — stay with the command, because they are about
 * a project's layout on disk rather than about the matrix. What lives here is
 * the part that is pure judgement over the matrix's contents, and it is the
 * only copy: the command renders these findings rather than repeating them.
 *
 * Findings come back in the order the checks run, so a caller that stops at the
 * first error reports the same one the old inline loop did.
 */
export class ValidateProjectUseCase {
  constructor(private traceRepo: ITraceabilityRepository) {}

  public execute(projectDir: string, opts: ValidateProjectOptions = {}): ValidateMatrixResult {
    const traceContent = this.traceRepo.readTraceability(projectDir);
    const report = new ValidationReport();

    if (traceContent === null) {
      report.addError(
        "traceability_missing",
        `docs/specs/traceability.md not found in ${projectDir}`,
        {
          file: "docs/specs/traceability.md",
          fixLines: ["Run `csda init` to scaffold the project structure."],
        }
      );
      return { report, mode: null, requirements: new Set() };
    }

    return this.checkMatrix(traceContent, opts);
  }

  /** The same checks against content the caller already has in hand. */
  public checkMatrix(
    traceContent: string,
    opts: ValidateProjectOptions = {}
  ): ValidateMatrixResult {
    const report = new ValidationReport();
    const requirements = new Set<string>();
    const mode = detectTraceabilityMode(traceContent);

    if (mode === null) {
      report.addError(
        "traceability_header_missing",
        "traceability.md is missing the expected legacy or rich matrix header",
        {
          file: "docs/specs/traceability.md",
          fixLines: [
            "Add the rich matrix header (recommended) to docs/specs/traceability.md:",
            `  ${RICH_HEADER}`,
          ],
        }
      );
      return { report, mode, requirements };
    }

    const strictTdd = opts.strictTdd === true;
    const seenScenarios = new Set<string>();

    for (const cells of parseMatrixRows(traceContent)) {
      const { requirementId, scenarioId, testArtifact, status } = readRowFields(cells, mode);
      if (requirementId) requirements.add(requirementId);

      if (scenarioId && scenarioId !== "-") {
        if (seenScenarios.has(scenarioId)) {
          report.addError(
            "duplicate_scenario_id",
            `Duplicate Scenario ID in traceability.md: ${scenarioId}`,
            {
              target: scenarioId,
              fixLines: [
                "Every Scenario ID must be unique across the matrix — renumber one of the rows",
                `(e.g. keep ${scenarioId} on the first row and give the second a new ID).`,
              ],
            }
          );
        }
        seenScenarios.add(scenarioId);
      }

      if (status && !ALLOWED_STATUS.has(status)) {
        report.addError("invalid_status", `Invalid status in traceability.md: ${status}`, {
          target: status,
          fixLines: [
            `Allowed statuses: ${[...ALLOWED_STATUS].join(" · ")}`,
            "Use `csda done <REQ-id>` to flip a row to Implemented safely.",
          ],
        });
      }

      if (!strictTdd) continue;

      if (testArtifact.toUpperCase() === "TBD" && status && POST_DRAFT_STATUS.has(status)) {
        report.addError(
          "strict_tdd_violation",
          `[TDD-1] Test artifact is TBD but status is '${status}' (scenario: ${scenarioId || "(no id)"})`,
          { target: "TDD-1" }
        );
      }

      if (mode === "rich" && !scenarioId && status && status !== "Draft") {
        report.addError(
          "strict_tdd_violation",
          `[TDD-2] Traceability row missing Scenario ID with status '${status}' (requirement: ${requirementId || "(none)"})`,
          { target: "TDD-2" }
        );
      }
    }

    if (strictTdd && mode === "rich" && typeof opts.specContent === "string") {
      for (const reqId of new Set(opts.specContent.match(/\bREQ-\d+\b/g) || [])) {
        if (!requirements.has(reqId)) {
          report.addError(
            "strict_tdd_violation",
            `[TDD-3] Requirement ${reqId} found in spec.md but has no row in traceability.md`,
            { target: "TDD-3" }
          );
        }
      }
    }

    return { report, mode, requirements };
  }
}

export { LEGACY_HEADER, RICH_HEADER, ALLOWED_STATUS, POST_DRAFT_STATUS };
