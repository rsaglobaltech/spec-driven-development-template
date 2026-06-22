"use strict";

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { computeTraceabilityDiagnostics, DiagnosticSeverity } from "../../src/diagnostics";
import { toLspDiagnostics, isTraceability } from "../../src/server";

const RICH_HEADER =
  "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |";
const RICH_SEP = "|---|---|---|---|---|---|---|---|---|---|";

function doc(...rows: string[]): string {
  return ["# Traceability", "", RICH_HEADER, RICH_SEP, ...rows].join("\n");
}

test("no diagnostics for a clean rich matrix", () => {
  const text = doc(
    "| REQ-001 | SCN-001 | features/a.feature | UC | Q | - | - | A.java | A#test | Implemented |"
  );
  assert.deepEqual(computeTraceabilityDiagnostics(text), []);
});

test("returns nothing for a non-rich document", () => {
  assert.deepEqual(computeTraceabilityDiagnostics("# just prose, no table"), []);
});

test("flags TDD-1: TBD test with post-Draft status", () => {
  const text = doc(
    "| REQ-001 | SCN-001 | features/a.feature | UC | Q | - | - | A.java | TBD | In Dev |"
  );
  const diags = computeTraceabilityDiagnostics(text);
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, "TDD-1");
  assert.equal(diags[0].severity, DiagnosticSeverity.Warning);
  assert.equal(diags[0].line, 4); // 0-based: header=2, sep=3, first row=4
  assert.match(diags[0].message, /csda req link REQ-001 --test/);
});

test("flags TDD-2: missing Scenario ID with non-Draft status", () => {
  const text = doc(
    "| REQ-002 | - | features/b.feature | UC | Q | - | - | B.java | B#test | In Dev |"
  );
  const diags = computeTraceabilityDiagnostics(text);
  assert.ok(diags.some((d) => d.code === "TDD-2"));
});

test("flags duplicate Scenario IDs as errors", () => {
  const text = doc(
    "| REQ-001 | SCN-001 | features/a.feature | UC | Q | - | - | A.java | A#test | Draft |",
    "| REQ-002 | SCN-001 | features/b.feature | UC | Q | - | - | B.java | B#test | Draft |"
  );
  const diags = computeTraceabilityDiagnostics(text);
  const dup = diags.find((d) => d.code === "DUP-SCN");
  assert.ok(dup, "expected a DUP-SCN diagnostic");
  assert.equal(dup!.severity, DiagnosticSeverity.Error);
});

test("flags invalid status values", () => {
  const text = doc(
    "| REQ-001 | SCN-001 | features/a.feature | UC | Q | - | - | A.java | A#test | Shipped |"
  );
  const diags = computeTraceabilityDiagnostics(text);
  assert.ok(diags.some((d) => d.code === "STATUS" && d.severity === DiagnosticSeverity.Error));
});

test("ignores non-REQ rows", () => {
  const text = doc("| note | see above | - | - | - | - | - | - | - | Draft |");
  assert.deepEqual(computeTraceabilityDiagnostics(text), []);
});

// ── server helpers ─────────────────────────────────────────────────────────────

test("toLspDiagnostics maps core diagnostics to LSP ranges", () => {
  const lsp = toLspDiagnostics([
    { line: 4, startCol: 0, endCol: 50, severity: 2, code: "TDD-1", message: "x" },
  ]);
  assert.equal(lsp[0].range.start.line, 4);
  assert.equal(lsp[0].range.end.character, 50);
  assert.equal(lsp[0].source, "spec-driven");
  assert.equal(lsp[0].code, "TDD-1");
});

test("isTraceability matches traceability.md uris only", () => {
  assert.ok(isTraceability("file:///p/docs/specs/traceability.md"));
  assert.ok(!isTraceability("file:///p/docs/specs/use-cases.md"));
});
