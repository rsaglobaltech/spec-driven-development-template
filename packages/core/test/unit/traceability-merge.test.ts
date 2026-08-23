/**
 * The row-wise matrix merge.
 *
 * These are the cases that decide whether a parallel harness run is usable, and
 * every one of them is a way an edit could be lost quietly — which is the only
 * outcome worse than a conflict.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { mergeTraceability } from "../../src/domain/TraceabilityMerge";

const HEADER =
  "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |";
const SEP = "|---|---|---|---|---|---|---|---|---|---|";

const row = (n: string, status: string) =>
  `| REQ-${n} | SCN-${n} | \`f${n}.feature\` | UC-${n} | C | A | E | \`s${n}.ts\` | \`t${n}.ts\` | ${status} |`;

const matrix = (rows: string[]) =>
  ["# Traceability Matrix", "", HEADER, SEP, ...rows, ""].join("\n");

const statusOf = (content: string, n: string) => {
  const line = content.split("\n").find((l) => l.includes(`| REQ-${n} |`));
  return line ? line.split("|").map((c) => c.trim())[10] : null;
};

test("two branches flipping adjacent rows merge cleanly", () => {
  // The case the driver exists for: plain git conflicts here because the rows
  // are consecutive lines, not because the edits overlap.
  const base = matrix([row("001", "Draft"), row("002", "Draft"), row("003", "Draft")]);
  const ours = matrix([row("001", "Implemented"), row("002", "Draft"), row("003", "Draft")]);
  const theirs = matrix([row("001", "Draft"), row("002", "Implemented"), row("003", "Draft")]);

  const { content, conflicts } = mergeTraceability(base, ours, theirs);
  assert.deepEqual(conflicts, []);
  assert.equal(statusOf(content, "001"), "Implemented", "our edit survived");
  assert.equal(statusOf(content, "002"), "Implemented", "their edit survived");
  assert.equal(statusOf(content, "003"), "Draft");
});

test("the same row changed differently is still a conflict", () => {
  // The safety property. A driver that resolved this by picking a side would
  // silently discard a decision somebody made.
  const base = matrix([row("001", "Draft")]);
  const ours = matrix([row("001", "Implemented")]);
  const theirs = matrix([row("001", "Verified")]);

  const { content, conflicts } = mergeTraceability(base, ours, theirs);
  assert.deepEqual(conflicts, ["REQ-001::SCN-001"]);
  assert.match(content, /<<<<<<< ours/);
  assert.match(content, /=======/);
  assert.match(content, />>>>>>> theirs/);
  assert.ok(content.includes("Implemented"), "both versions are shown");
  assert.ok(content.includes("Verified"));
});

test("the same row changed the same way is not a conflict", () => {
  const base = matrix([row("001", "Draft")]);
  const same = matrix([row("001", "Implemented")]);

  const { content, conflicts } = mergeTraceability(base, same, same);
  assert.deepEqual(conflicts, []);
  assert.equal(statusOf(content, "001"), "Implemented");
});

test("a row only they changed is taken; a row only we changed is kept", () => {
  const base = matrix([row("001", "Draft"), row("002", "Draft")]);
  const ours = matrix([row("001", "Implemented"), row("002", "Draft")]);
  const theirs = matrix([row("001", "Draft"), row("002", "Verified")]);

  const { content } = mergeTraceability(base, ours, theirs);
  assert.equal(statusOf(content, "001"), "Implemented");
  assert.equal(statusOf(content, "002"), "Verified");
});

test("a row only they have is added, inside the table", () => {
  const base = matrix([row("001", "Draft")]);
  const ours = matrix([row("001", "Implemented")]);
  const theirs = matrix([row("001", "Draft"), row("002", "Draft")]);

  const { content, conflicts } = mergeTraceability(base, ours, theirs);
  assert.deepEqual(conflicts, []);
  assert.equal(statusOf(content, "002"), "Draft", "their new row arrived");

  const lines = content.split("\n");
  const sep = lines.findIndex((l) => l.includes("---|"));
  const added = lines.findIndex((l) => l.includes("| REQ-002 |"));
  assert.ok(added > sep, "the added row must be inside the table, not after it");
});

test("a row we added and they never had is kept", () => {
  const base = matrix([row("001", "Draft")]);
  const ours = matrix([row("001", "Draft"), row("002", "Draft")]);
  const theirs = matrix([row("001", "Implemented")]);

  const { content, conflicts } = mergeTraceability(base, ours, theirs);
  assert.deepEqual(conflicts, []);
  assert.equal(statusOf(content, "002"), "Draft", "our new row survived their merge");
  assert.equal(statusOf(content, "001"), "Implemented");
});

test("the status is never part of the row key", () => {
  // The bug that nearly shipped: keying on a cell that changes makes an edited
  // row look like a new row, so the merge reports success and loses an edit.
  const base = matrix([row("001", "Draft")]);
  const ours = matrix([row("001", "Draft")]);
  const theirs = matrix([row("001", "Implemented")]);

  const { content } = mergeTraceability(base, ours, theirs);
  const rows = content.split("\n").filter((l) => l.includes("| REQ-001 |"));
  assert.equal(rows.length, 1, "a status change must not duplicate the row");
  assert.equal(statusOf(content, "001"), "Implemented");
});

test("prose and headers outside the table are carried through untouched", () => {
  const base = matrix([row("001", "Draft")]);
  const ours = [
    "# Traceability Matrix",
    "",
    "Some local note.",
    "",
    HEADER,
    SEP,
    row("001", "Implemented"),
    "",
  ].join("\n");
  const theirs = matrix([row("001", "Draft")]);

  const { content } = mergeTraceability(base, ours, theirs);
  assert.match(content, /Some local note\./);
  assert.match(content, /^# Traceability Matrix/);
});

test("a file with no recognisable header is handed back unresolved", () => {
  // Guessing the shape of a matrix during a merge is how a file gets rewritten
  // into something nobody asked for.
  const { content, conflicts } = mergeTraceability("", "not a matrix\n", "nor this\n");
  assert.equal(content, "not a matrix\n");
  assert.equal(conflicts.length, 1);
});

test("with no common ancestor, differing rows conflict rather than pick a side", () => {
  // git passes an empty base for unrelated histories. Two sides that both
  // "added" the same requirement differently have no basis for a merge.
  const ours = matrix([row("001", "Implemented")]);
  const theirs = matrix([row("001", "Verified")]);

  const { conflicts } = mergeTraceability("", ours, theirs);
  assert.deepEqual(conflicts, ["REQ-001::SCN-001"]);
});
