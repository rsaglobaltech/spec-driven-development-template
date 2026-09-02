/**
 * #168: a scenario declared in a feature file that nothing tests.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import {
  scenariosIn,
  uncoveredScenarios,
  normalise,
  linkIsUnevidenced,
} from "../../src/domain/ScenarioCoverage";

const FEATURE = `Feature: Invoice totals

  Scenario: SCN-010 subtotal is the sum of line amounts
    Given two lines
    When the invoice is totalled
    Then the subtotal is their sum

  Scenario: SCN-011 tax is applied per line
    Given two rates
    When the invoice is totalled
    Then each line carries its own rate

  Scenario: SCN-012 a fully discounted invoice carries no tax
    Given a 100% discount
    When the invoice is totalled
    Then the tax is zero
`;

test("every scenario in the file is found, not just the one the row names", () => {
  assert.deepEqual(
    scenariosIn(FEATURE).map((s) => s.needles[0]),
    ["SCN-010", "SCN-011", "SCN-012"]
  );
});

test("the scenario nothing tests is the one reported", () => {
  // The measured case: an agent wrote tests for the scenarios it could satisfy
  // and skipped the one it could not.
  const tests = [
    `test("SCN-010 subtotal is the sum of line amounts", () => {});
     test("SCN-011 tax is applied per line", () => {});`,
  ];
  const missing = uncoveredScenarios(FEATURE, tests);
  assert.equal(missing.length, 1);
  assert.match(missing[0].title, /fully discounted/);
});

test("a fully covered feature reports nothing", () => {
  const tests = ["SCN-010 SCN-011 SCN-012"];
  assert.deepEqual(uncoveredScenarios(FEATURE, tests), []);
});

test("a tag identifies a scenario even after the title is reworded", () => {
  // The one edit that otherwise defeats every link to a scenario.
  const tagged = `Feature: F

  @REQ-001 @SCN-042
  Scenario: something else entirely now
    Given a thing
    When it happens
    Then it holds
`;
  assert.deepEqual(scenariosIn(tagged)[0].needles, ["SCN-042"]);
  assert.deepEqual(uncoveredScenarios(tagged, ["covers @SCN-042 here"]), []);
});

test("without an id anywhere, the title is the identity", () => {
  const untagged = `Feature: F

  Scenario: the cart rejects a negative quantity
    Given a cart
    When a negative quantity is added
    Then it is rejected
`;
  assert.deepEqual(scenariosIn(untagged)[0].needles, ["the cart rejects a negative quantity"]);
  assert.deepEqual(
    uncoveredScenarios(untagged, ['test("The cart rejects a negative quantity!", ...)']),
    [],
    "punctuation and case must not break a title match"
  );
  assert.equal(uncoveredScenarios(untagged, ["something unrelated"]).length, 1);
});

test("a Scenario Outline counts — the widest scenarios must not be the unchecked ones", () => {
  const outline = `Feature: F

  Scenario Outline: SCN-050 rounding across currencies
    Given <amount>
    When it is rounded
    Then it is <result>

    Examples:
      | amount | result |
      | 1.005  | 1.01   |
`;
  assert.equal(scenariosIn(outline).length, 1);
  assert.equal(uncoveredScenarios(outline, ["nothing"]).length, 1);
});

test("a scenario proved in any of several test files is proved", () => {
  const missing = uncoveredScenarios(FEATURE, ["SCN-010", "SCN-011", "SCN-012 over here"]);
  assert.deepEqual(missing, []);
});

test("no test sources at all leaves every scenario uncovered", () => {
  assert.equal(uncoveredScenarios(FEATURE, []).length, 3);
});

test("normalise strips what should not decide a match", () => {
  assert.equal(normalise("SCN-010: Subtotal!"), normalise("scn010 subtotal"));
});

// ── Fase 1.2: a link that exists but lies ────────────────────────────────────

test("a test artifact naming the requirement is evidence enough", () => {
  assert.equal(linkIsUnevidenced("REQ-014", "", ['test("REQ-014 vets are listed")']), false);
});

test("a test artifact naming one of the requirement's scenarios is evidence", () => {
  assert.equal(linkIsUnevidenced("REQ-010", FEATURE, ["SCN-011 tax"]), false);
});

test("the measured lie: a seeded row pointed at somebody else's test", () => {
  // A "Vet" requirement declaring PetValidatorTests.java as its proof. The row
  // has no scenario, so there is nothing for the scenario check to match on —
  // which is exactly why those rows lie most easily.
  assert.equal(
    linkIsUnevidenced("REQ-014", "", ["class PetTypeFormatterTests { void formatsAName() {} }"]),
    true
  );
});

test("no test sources at all is not evidence", () => {
  assert.equal(linkIsUnevidenced("REQ-014", FEATURE, []), true);
});

test("a row with no requirement id is not this check's business", () => {
  assert.equal(linkIsUnevidenced("", FEATURE, ["anything"]), false);
});
