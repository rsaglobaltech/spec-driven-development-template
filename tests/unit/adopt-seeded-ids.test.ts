/**
 * The bug three independent cold adoptions found on three different stacks.
 *
 * `adopt` seeds one proposal row per capability it detects. Those rows carry no
 * scenario and no feature file yet — that is the whole point, they are proposals
 * to argue with. `parseTraceabilityRows` deduplicated on `featureFile::scenarioId`,
 * so every seeded row hashed to the same `-::-` and all but the first vanished
 * from the parse.
 *
 * Nothing looked broken, because the file on disk still had every row. Only the
 * *reading* was short, and the first thing that reads it is the ID allocator:
 * `req add` handed out an ID that was already taken, and `req link` then wrote
 * both rows at once — so linking a new requirement silently retargeted a seeded
 * one, and the matrix claimed a test proved something it had never seen.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { parseTraceabilityRows } from "../../packages/core/src/domain/TraceabilityFormat";
import { TraceabilityMatrix } from "../../packages/core/src/domain/TraceabilityMatrix";

const HEADER =
  "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |\n" +
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |";

/** What `adopt` writes on a brownfield repo with three detected capabilities. */
const SEEDED = [
  HEADER,
  "| REQ-001 | SCN-001 | `features/adoption/baseline.feature` | UC-001 Preserve existing behaviour | - | - | - | existing codebase | `npm test` | Draft |",
  "| REQ-002 | - | - | UC-002 Router | - | - | - | `lib/router` | TBD | Draft |",
  "| REQ-003 | - | - | UC-003 Middleware | - | - | - | `lib/middleware` | TBD | Draft |",
].join("\n");

test("every seeded proposal row survives the parse", () => {
  const { rows } = parseTraceabilityRows(SEEDED);
  assert.deepEqual(
    rows.map((r: any) => r.requirement),
    ["REQ-001", "REQ-002", "REQ-003"],
    "rows with no scenario yet are distinct requirements, not duplicates of each other"
  );
});

test("the next id clears every seeded requirement", () => {
  const { rows } = parseTraceabilityRows(SEEDED);
  assert.equal(
    TraceabilityMatrix.nextReqId(rows),
    "REQ-004",
    "REQ-003 is taken — reissuing it puts two requirements under one id"
  );
});

test("a genuine duplicate scenario link is still collapsed", () => {
  const withDupe = [
    SEEDED,
    "| REQ-004 | SCN-002 | features/http/routing.feature | A route dispatches GET | - | - | - | lib/router | test/router.js | Draft |",
    "| REQ-004 | SCN-002 | features/http/routing.feature | A route dispatches GET | - | - | - | lib/router | test/router.js | Draft |",
  ].join("\n");
  const { rows } = parseTraceabilityRows(withDupe);
  assert.equal(rows.length, 4, "the same scenario in the same feature file is one row");
});
