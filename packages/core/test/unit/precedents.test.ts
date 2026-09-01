"use strict";

/**
 * Choosing the precedent (D2).
 *
 * The prompt is entirely normative — facts, Gherkin, rules, definition of done.
 * None of it shows an agent what an accepted implementation looks like *here*,
 * so it invents a house style and the next attempt is spent correcting it.
 *
 * The rules below are the ones that decide whether a precedent helps or hurts:
 * a precedent from another bounded context teaches conventions that do not
 * apply, with the authority of "this was accepted".
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { choosePrecedent, excerpt } = require("../../src/domain/Precedents");

const row = (id: string, status: string, testArtifact = "", technicalArtifact = "") => ({
  requirementId: id,
  status,
  testArtifact,
  technicalArtifact,
});

test("the most recent accepted requirement in the same context wins", () => {
  const rows = [
    row("REQ-001", "Verified", "t/one.test.ts", "src/one.ts"),
    row("REQ-002", "Verified", "t/two.test.ts", "src/two.ts"),
  ];
  const contexts = { "REQ-001": "Billing", "REQ-002": "Billing", "REQ-003": "Billing" };
  const choice = choosePrecedent(rows, contexts, "REQ-003");
  assert.equal(choice.requirementId, "REQ-002");
  assert.equal(choice.testArtifact, "t/two.test.ts");
  assert.equal(choice.technicalArtifact, "src/two.ts");
});

test("a different bounded context is not a precedent", () => {
  // Worse than none: it teaches conventions that do not apply, with the
  // authority of having been accepted.
  const rows = [row("REQ-001", "Verified", "t/one.test.ts", "src/one.ts")];
  const contexts = { "REQ-001": "Billing", "REQ-002": "Shipping" };
  assert.equal(choosePrecedent(rows, contexts, "REQ-002"), null);
});

test("a project with no contexts at all shares one", () => {
  // A codebase nobody has divided yet is one context, not none.
  const rows = [row("REQ-001", "Verified", "t/one.test.ts", "src/one.ts")];
  assert.equal(choosePrecedent(rows, {}, "REQ-002").requirementId, "REQ-001");
});

test("Implemented is not Verified", () => {
  // `Implemented` means the code exists; `Verified` means somebody checked it.
  // Copying an unchecked implementation propagates whatever is wrong with it.
  const rows = [row("REQ-001", "Implemented", "t/one.test.ts", "src/one.ts")];
  assert.equal(choosePrecedent(rows, {}, "REQ-002"), null);
});

test("status matching ignores case and padding", () => {
  const rows = [row("REQ-001", "  verified ", "t/one.test.ts", "src/one.ts")];
  assert.equal(choosePrecedent(rows, {}, "REQ-002").requirementId, "REQ-001");
});

test("a row with no artifacts is not a precedent", () => {
  // There is nothing to show. A section naming a requirement and quoting
  // nothing is worse than no section.
  const rows = [row("REQ-001", "Verified", "TBD", "-")];
  assert.equal(choosePrecedent(rows, {}, "REQ-002"), null);
});

test("one artifact is enough", () => {
  const rows = [row("REQ-001", "Verified", "t/one.test.ts", "TBD")];
  const choice = choosePrecedent(rows, {}, "REQ-002");
  assert.equal(choice.testArtifact, "t/one.test.ts");
  assert.equal(choice.technicalArtifact, "", "a placeholder must not become a path");
});

test("a requirement is never its own precedent", () => {
  const rows = [row("REQ-002", "Verified", "t/two.test.ts", "src/two.ts")];
  assert.equal(choosePrecedent(rows, {}, "REQ-002"), null);
});

test("a later requirement is not a precedent for an earlier one", () => {
  // Precedent means already settled. Pointing REQ-001 at REQ-009 would make
  // the example depend on work that may not exist when REQ-001 is attempted.
  const rows = [row("REQ-009", "Verified", "t/nine.test.ts", "src/nine.ts")];
  assert.equal(choosePrecedent(rows, {}, "REQ-001"), null);
});

test("backticks around a path are not part of the path", () => {
  const rows = [row("REQ-001", "Verified", "`t/one.test.ts`", "`src/one.ts`")];
  const choice = choosePrecedent(rows, {}, "REQ-002");
  assert.equal(choice.testArtifact, "t/one.test.ts");
});

// ── excerpt ──────────────────────────────────────────────────────────────────

test("a short file is quoted whole", () => {
  assert.equal(excerpt("a\nb\nc"), "a\nb\nc");
});

test("a long file is cut and says so", () => {
  // A thousand-line class in the prompt costs the agent the budget it needs
  // for its own work, and the part that teaches the convention is the top.
  const out = excerpt(Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n"), 10);
  assert.match(out, /^line 0\n/);
  assert.match(out, /… \(90 more lines\)$/);
  assert.doesNotMatch(out, /line 50/);
});

test("excerpt survives an empty file", () => {
  assert.equal(excerpt(""), "");
  assert.equal(excerpt(null), "");
});
