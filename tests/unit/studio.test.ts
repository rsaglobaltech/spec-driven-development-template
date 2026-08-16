/**
 * Unit tests for the `studio` view-model helpers (buildModel, mermaid, renderHtml).
 * The HTTP server is a thin wrapper and is exercised manually.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { buildModel, mermaid, renderHtml } from "../../scripts/studio";

const RICH_HEADER =
  "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |";
const RICH_SEP = "|---|---|---|---|---|---|---|---|---|---|";

function doc(...rows: string[]): string {
  return ["# Traceability", "", RICH_HEADER, RICH_SEP, ...rows].join("\n");
}

test("buildModel counts done vs pending", () => {
  const m = buildModel(
    doc(
      "| REQ-001 | SCN-001 | f/a.feature | UC | Q | - | - | A | T | Implemented |",
      "| REQ-002 | SCN-002 | f/b.feature | UC | Q | - | - | B | T | Draft |"
    )
  );
  assert.equal(m.total, 2);
  assert.equal(m.done, 1);
  assert.equal(m.pending, 1);
  assert.equal(m.requirements[0].done, true);
  assert.equal(m.requirements[1].done, false);
});

test("buildModel ignores non-REQ rows", () => {
  const m = buildModel(doc("| note | - | - | - | - | - | - | - | - | Draft |"));
  assert.equal(m.total, 0);
});

test("mermaid renders a node per requirement with a class", () => {
  const m = buildModel(
    doc("| REQ-001 | SCN-001 | f/a.feature | UC | Q | - | - | A | T | Implemented |")
  );
  const g = mermaid(m);
  assert.match(g, /flowchart LR/);
  assert.match(g, /REQ_001\[/);
  assert.match(g, /:::done/);
  assert.match(g, /classDef done/);
});

test("renderHtml embeds the table and the mermaid block", () => {
  const m = buildModel(doc("| REQ-001 | SCN-001 | f/a.feature | UC | Q | - | - | A | T | Draft |"));
  const html = renderHtml("/tmp/proj", m);
  assert.match(html, /<table>/);
  assert.match(html, /class="mermaid"/);
  assert.match(html, /REQ-001/);
});
