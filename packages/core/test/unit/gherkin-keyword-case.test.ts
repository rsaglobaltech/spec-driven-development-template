/**
 * Lines that were trying to be Gherkin keywords and are not (F3).
 *
 * Cucumber discards them in silence: `GIVEN a flag` is prose to it, so the
 * scenario ends up with fewer steps than it appears to have — or none. That
 * silence is what let H14 ship 27 scenarios which executed nothing while
 * `pack lint --strict` reported the packs as fine.
 *
 * The risk of a check like this is the opposite failure: crying wolf on prose
 * that merely resembles a keyword. Most of what is asserted here is that it
 * stays quiet.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { findKeywordCaseIssues } from "../../src/domain/Gherkin";

const feature = (...lines: string[]) => lines.join("\n") + "\n";

test("upper-case step keywords are reported with the spelling that works", () => {
  // H14 exactly. The fix has to be literal: "write `Given`" is actionable,
  // "no steps found" is a riddle.
  const issues = findKeywordCaseIssues(
    feature(
      "Feature: Flags",
      "  Scenario: Rollout",
      "    GIVEN a flag",
      "    WHEN evaluated",
      "    THEN it works"
    )
  );
  assert.deepEqual(
    issues.map((i) => [i.line, i.found, i.expected]),
    [
      [3, "GIVEN", "Given"],
      [4, "WHEN", "When"],
      [5, "THEN", "Then"],
    ]
  );
});

test("a mis-cased block keyword is reported too", () => {
  const issues = findKeywordCaseIssues(
    feature("Feature: Flags", "  SCENARIO: Rollout", "    Given a flag")
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].found, "SCENARIO");
  assert.equal(issues[0].expected, "Scenario");
});

test("a space before the colon is caught, though the case is right", () => {
  // `Feature :` reads as correct and is not: Cucumber does not recognise it,
  // so the whole file silently has no feature.
  const issues = findKeywordCaseIssues(
    feature("Feature : Flags", "  Scenario: Rollout", "    Given a flag")
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].expected, "Feature");
});

test("lower-case keywords are caught as well as upper-case ones", () => {
  const issues = findKeywordCaseIssues(
    feature("Feature: Flags", "  Scenario: Rollout", "    given a flag")
  );
  assert.deepEqual(
    issues.map((i) => [i.found, i.expected]),
    [["given", "Given"]]
  );
});

test("a correct file reports nothing", () => {
  const issues = findKeywordCaseIssues(
    feature(
      "@tagged",
      "Feature: Flags",
      "  Background:",
      "    Given a tenant",
      "  Rule: Rollout",
      "    Scenario Outline: Percentages",
      "      Given a flag at <n>",
      "      When users are evaluated",
      "      Then roughly <n> receive it",
      "      And nobody else does",
      "      * even this one",
      "      Examples:",
      "        | n  |",
      "        | 50 |"
    )
  );
  assert.deepEqual(issues, []);
});

test("a word that merely starts like a keyword is not a mistake", () => {
  // `Givenchy` begins with `Given`. The trailing space in the keyword table is
  // what separates them, and this is the test that keeps it there.
  const issues = findKeywordCaseIssues(
    feature("Feature: Brands", "  Scenario: Launch", "    Given Givenchy launched a product")
  );
  assert.deepEqual(issues, []);
});

test("keywords inside a doc string are content, not mistakes", () => {
  const issues = findKeywordCaseIssues(
    feature(
      "Feature: Payloads",
      "  Scenario: A body that looks like Gherkin",
      "    Given a request body",
      '      """',
      "      GIVEN this is documentation",
      "      SCENARIO: and so is this",
      '      """',
      "    When it is sent",
      "    Then it is accepted"
    )
  );
  assert.deepEqual(issues, []);
});

test("data tables, comments and tags are left alone", () => {
  const issues = findKeywordCaseIssues(
    feature(
      "# GIVEN this comment mentions a keyword",
      "@GIVEN",
      "Feature: Tables",
      "  Scenario Outline: Rows",
      "    Given a value <v>",
      "    Examples:",
      "      | v     |",
      "      | GIVEN |"
    )
  );
  assert.deepEqual(issues, []);
});

test("the Spanish dialect is judged by its own keywords", () => {
  const wrong = findKeywordCaseIssues(
    feature(
      "# language: es",
      "Característica: Facturación",
      "  Escenario: Emitir",
      "    DADO un cliente"
    )
  );
  assert.deepEqual(
    wrong.map((i) => [i.found, i.expected]),
    [["DADO", "Dado"]]
  );

  const right = findKeywordCaseIssues(
    feature(
      "# language: es",
      "Característica: Facturación",
      "  Escenario: Emitir",
      "    Dado un cliente"
    )
  );
  assert.deepEqual(right, []);
});

test("an English keyword in a Spanish file is not silently accepted", () => {
  // `Given` is not a keyword in `es`, so Cucumber reads it as prose. Reporting
  // it as an unknown keyword would be wrong — it is a dialect mismatch — but
  // staying silent is what H14 was.
  const issues = findKeywordCaseIssues(
    feature("# language: es", "Característica: X", "  Escenario: Y", "    Given a customer")
  );
  assert.deepEqual(issues, [], "not a case mistake; `scenario_has_no_steps` is what reports this");
});
