/**
 * Fase 4.1: `req add` had no counterpart, so two cold adoptions repaired the
 * matrix by hand with a script.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import {
  planRemoval,
  removeMatrixRows,
  removeSpecProse,
  isDelivered,
} from "../../src/domain/RequirementRemoval";

const HEADER =
  "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |\n" +
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |";

const MATRIX = [
  HEADER,
  "| REQ-001 | SCN-001 | `features/core/health.feature` | UC-001 Health | - | - | - | src/h.js | tests/h.js | Verified |",
  "| REQ-002 | SCN-002 | `features/billing/totals.feature` | UC-002 Totals | - | - | - | src/t.js | tests/t.js | Draft |",
  "| REQ-003 | SCN-003 | `features/core/health.feature` | UC-003 Also health | - | - | - | src/x.js | tests/x.js | Draft |",
].join("\n");

const SPEC = [
  "# Spec",
  "",
  "## 8. Key requirements",
  "",
  "| ID | Requirement | Priority | Status |",
  "|---|---|---|---|",
  "| REQ-002 | Totals are rounded | Must | Draft |",
  "",
  "### REQ-002 — Totals are rounded",
  "",
  "The system MUST satisfy: Totals are rounded.",
  "",
  "### REQ-003 — Also health",
  "",
  "kept",
].join("\n");

test("the plan names every row the id owns", () => {
  const plan = planRemoval(MATRIX, "REQ-002", SPEC);
  assert.equal(plan.rows.length, 1);
  assert.deepEqual(plan.statuses, ["Draft"]);
  assert.equal(plan.hasProse, true);
});

test("a feature file another row still uses is not orphaned", () => {
  // REQ-001 and REQ-003 share health.feature; removing one leaves it referenced.
  assert.deepEqual(planRemoval(MATRIX, "REQ-001", SPEC).orphanedFeatures, []);
  assert.deepEqual(planRemoval(MATRIX, "REQ-002", SPEC).orphanedFeatures, [
    "features/billing/totals.feature",
  ]);
});

test("a delivered requirement is flagged, a draft is not", () => {
  // Removing an Implemented row deletes the record that something shipped.
  assert.equal(isDelivered("Verified"), true);
  assert.equal(isDelivered("Implemented"), true);
  assert.equal(isDelivered("Draft"), false);
  assert.equal(isDelivered(""), false);
  assert.equal(planRemoval(MATRIX, "REQ-001", SPEC).statuses.some(isDelivered), true);
});

test("removing takes the row and leaves the others alone", () => {
  const after = removeMatrixRows(MATRIX, "REQ-002");
  assert.ok(!after.includes("REQ-002"));
  assert.ok(after.includes("REQ-001"));
  assert.ok(after.includes("REQ-003"));
  assert.ok(after.includes("| Requirement | Scenario ID |"), "the header survives");
});

test("duplicate rows under one id all go", () => {
  const withDupe =
    MATRIX + "\n| REQ-002 | SCN-009 | - | UC-002 again | - | - | - | - | - | Draft |";
  assert.equal(planRemoval(withDupe, "REQ-002", SPEC).rows.length, 2);
  assert.ok(!removeMatrixRows(withDupe, "REQ-002").includes("REQ-002"));
});

test("the prose goes: both the section and the table row", () => {
  const after = removeSpecProse(SPEC, "REQ-002");
  assert.ok(!after.includes("REQ-002"));
  assert.ok(!after.includes("Totals are rounded"), "the section body goes with its heading");
  assert.ok(after.includes("### REQ-003 — Also health"), "the next requirement survives");
  assert.ok(after.includes("kept"));
  assert.ok(after.includes("## 8. Key requirements"), "the enclosing section survives");
});

test("removing the last requirement does not eat the rest of the document", () => {
  const spec =
    "## 8. Key requirements\n\n### REQ-002 — Gone\n\nbody\n\n## 9. Non-functional\n\nkept\n";
  const after = removeSpecProse(spec, "REQ-002");
  assert.ok(!after.includes("REQ-002"));
  assert.ok(after.includes("## 9. Non-functional"));
  assert.ok(after.includes("kept"));
});

test("an id that is not there changes nothing", () => {
  assert.equal(removeMatrixRows(MATRIX, "REQ-999"), MATRIX);
  assert.equal(planRemoval(MATRIX, "REQ-999", SPEC).rows.length, 0);
});

test("REQ-01 does not match REQ-014", () => {
  const m = HEADER + "\n| REQ-014 | - | - | UC | - | - | - | - | - | Draft |";
  assert.equal(removeMatrixRows(m, "REQ-01"), m);
});
