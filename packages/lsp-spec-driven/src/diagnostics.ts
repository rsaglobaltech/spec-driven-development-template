"use strict";

/**
 * Pure diagnostics core for the spec-driven Language Server.
 *
 * Given the text of a `traceability.md` file, produce LSP-shaped diagnostics
 * (0-based line ranges) for the same rules the CLI's `validate --strict-tdd`
 * enforces — so the editor surfaces problems inline, with the same vocabulary,
 * before the dev ever runs the gate. No filesystem access: the function is a
 * pure transform of the document text, which keeps it trivially testable and
 * lets the server run it on every keystroke.
 */

export const DiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4,
} as const;

export interface SpecDiagnostic {
  line: number; // 0-based
  startCol: number;
  endCol: number;
  severity: number;
  code: string;
  message: string;
}

const RICH_HEADER = "| Requirement | Scenario ID |";
const LEGACY_HEADER = "| Feature | Scenario |";

const ALLOWED_STATUS = new Set([
  "Draft",
  "Needs Clarification",
  "Domain Reviewed",
  "Architecture Reviewed",
  "Ready for Dev",
  "Approved",
  "In Dev",
  "In Review",
  "Implemented",
  "Verified",
  "Released",
  "Deprecated",
]);

const POST_DRAFT_STATUS = new Set([
  "Needs Clarification",
  "Domain Reviewed",
  "Architecture Reviewed",
  "Ready for Dev",
  "Approved",
  "In Dev",
  "In Review",
  "Implemented",
  "Verified",
  "Released",
  "Deprecated",
]);

function trimCell(s: string): string {
  return (s || "").trim();
}

function isDataRow(line: string): boolean {
  if (!line.startsWith("|")) return false;
  if (line.includes("---")) return false;
  if (line.includes(RICH_HEADER)) return false;
  if (line.includes(LEGACY_HEADER)) return false;
  return true;
}

/**
 * Compute diagnostics for a traceability.md document.
 * Returns an empty list for non-rich tables (legacy/plain prose) — the rich
 * matrix is the only shape with enough structure to check.
 */
export function computeTraceabilityDiagnostics(text: string): SpecDiagnostic[] {
  const diagnostics: SpecDiagnostic[] = [];
  if (!text.includes(RICH_HEADER)) return diagnostics;

  const lines = text.split("\n");
  const seenScenarios = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trimEnd();
    if (!isDataRow(raw)) continue;
    const cells = raw.split("|").map(trimCell);
    if (cells.length < 12) continue;

    const requirementId = cells[1] || "";
    const scenarioId = cells[2] || "";
    const testArtifact = cells[9] || "";
    const status = cells[10] || "";
    if (!/^REQ-\d+/.test(requirementId)) continue;

    const fullCol = lines[i].length;
    const at = (code: string, severity: number, message: string) =>
      diagnostics.push({ line: i, startCol: 0, endCol: fullCol, severity, code, message });

    if (status && !ALLOWED_STATUS.has(status)) {
      at(
        "STATUS",
        DiagnosticSeverity.Error,
        `Invalid status '${status}'. Allowed: ${[...ALLOWED_STATUS].slice(0, 4).join(", ")}, …`
      );
    }

    if (scenarioId && scenarioId !== "-") {
      const prev = seenScenarios.get(scenarioId);
      if (prev !== undefined) {
        at(
          "DUP-SCN",
          DiagnosticSeverity.Error,
          `Duplicate Scenario ID '${scenarioId}' (first used on line ${prev + 1}).`
        );
      } else {
        seenScenarios.set(scenarioId, i);
      }
    }

    if (testArtifact.toUpperCase() === "TBD" && status && POST_DRAFT_STATUS.has(status)) {
      at(
        "TDD-1",
        DiagnosticSeverity.Warning,
        `Test artifact is TBD but status is '${status}'. Link a test: csda req link ${requirementId} --test <path>.`
      );
    }

    if ((!scenarioId || scenarioId === "-") && status && status !== "Draft") {
      at(
        "TDD-2",
        DiagnosticSeverity.Warning,
        `Missing Scenario ID with status '${status}'. Add one: csda req link ${requirementId} --scenario SCN-NNN.`
      );
    }
  }

  return diagnostics;
}
