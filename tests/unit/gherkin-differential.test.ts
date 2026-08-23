/**
 * Our Gherkin reader against Cucumber's, over every file this repository ships.
 *
 * ## Why this is the load-bearing test of F1
 *
 * The CLI reads Gherkin with its own parser because `package.json` has no
 * runtime dependencies and the tool runs through `npx` on other people's
 * machines. That choice is defensible only while the two agree, so this is
 * where the agreement is checked rather than assumed: for every `.feature` and
 * `.feature.tpl` shipped, both parsers read the same file and must report the
 * same feature name, the same scenarios in the same order, and the same steps.
 *
 * H14 is the reason it exists. Three hand-written parsers in this tree matched
 * keywords case-insensitively, so they saw steps where Cucumber saw none, and
 * 27 pack scenarios shipped executing nothing while `pack lint --strict` called
 * them fine. A parser that is *nearly* right about Gherkin produces a gate that
 * is confidently wrong.
 *
 * Where the two disagree, Cucumber is right and ours is the bug.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const { Parser, AstBuilder, GherkinClassicTokenMatcher } = require("@cucumber/gherkin");
const { IdGenerator } = require("@cucumber/messages");

const { parseGherkin } = require("../../packages/core/src/domain/Gherkin");

const ROOT_DIR = path.resolve(__dirname, "../../..");

/** Every Gherkin file the repository ships, `.env.feature` excluded — see shipped-gherkin.test.ts. */
function shippedGherkinFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const isGherkin = entry.name.endsWith(".feature") || entry.name.endsWith(".feature.tpl");
      if (isGherkin && !entry.name.startsWith(".env")) out.push(full);
    }
  };
  for (const root of ["packs", "templates", "features"]) walk(path.join(ROOT_DIR, root));
  return out.sort();
}

/** What Cucumber makes of a file, reduced to the shape our parser produces. */
function referenceShape(source: string) {
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
  const doc = parser.parse(source);

  const scenarios: any[] = [];
  const collect = (children: any[]) => {
    for (const child of children || []) {
      if (child.scenario) {
        scenarios.push({
          name: child.scenario.name,
          steps: (child.scenario.steps || []).map((s: any) => ({
            keyword: s.keyword.trim(),
            text: s.text,
          })),
        });
      }
      if (child.rule) collect(child.rule.children);
    }
  };
  collect(doc.feature?.children || []);

  return { feature: doc.feature?.name ?? null, scenarios };
}

/** The same shape, from ours. Background steps are excluded on both sides. */
function ourShape(source: string) {
  const doc = parseGherkin(source);
  return {
    feature: doc.feature,
    scenarios: doc.scenarios.map((s: any) => ({
      name: s.name,
      steps: s.steps.map((step: any) => ({ keyword: step.rawKeyword, text: step.text })),
    })),
  };
}

test("our parser agrees with Cucumber on every shipped Gherkin file", () => {
  const files = shippedGherkinFiles();
  assert.ok(files.length >= 30, `expected the shipped corpus, found ${files.length}`);

  const disagreements: string[] = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT_DIR, file);

    let reference;
    try {
      reference = referenceShape(source);
    } catch (err) {
      disagreements.push(
        `${rel}: Cucumber cannot parse it — ${(err as Error).message.split("\n")[0]}`
      );
      continue;
    }

    const ours = ourShape(source);
    if (JSON.stringify(ours) !== JSON.stringify(reference)) {
      disagreements.push(
        `${rel}\n      ours:      ${JSON.stringify(ours)}\n      cucumber:  ${JSON.stringify(reference)}`
      );
    }
  }

  assert.deepEqual(
    disagreements,
    [],
    `\n  Our reader and Cucumber's disagree. Cucumber is the runner, so it is\n` +
      `  right and ours is the bug:\n\n    ${disagreements.join("\n\n    ")}`
  );
});

test("the two agree on constructed cases the shipped corpus does not contain", () => {
  // The corpus is real but narrow — no Rule, no Background, no tags, no
  // Scenario Outline, no doc strings. Those paths need exercising too, or the
  // differential passes because nothing uses them.
  const cases: Record<string, string> = {
    "rule and background": [
      "Feature: Billing",
      "  Background:",
      "    Given a customer exists",
      "  Rule: Refunds",
      "    Scenario: A refund cannot exceed the payment",
      "      Given a payment of 10",
      "      When a refund of 20 is attempted",
      "      Then it is rejected",
      "",
    ].join("\n"),

    "tags on feature and scenario": [
      "@billing @slow",
      "Feature: Invoicing",
      "  @happy",
      "  Scenario: Issuing an invoice",
      "    Given a customer",
      "    When an invoice is issued",
      "    Then InvoiceIssued is emitted",
      "",
    ].join("\n"),

    "scenario outline with examples": [
      "Feature: Rollout",
      "  Scenario Outline: Rollout percentage is respected",
      "    Given a flag at <percent>",
      "    When users are evaluated",
      "    Then roughly <percent> receive it",
      "    Examples:",
      "      | percent |",
      "      | 50      |",
      "",
    ].join("\n"),

    "and, but and asterisk inherit": [
      "Feature: Inheritance",
      "  Scenario: Steps continue",
      "    Given a thing",
      "    And another thing",
      "    When it happens",
      "    But not twice",
      "    Then it works",
      "    * and also this",
      "",
    ].join("\n"),

    "doc string containing keywords": [
      "Feature: Doc strings",
      "  Scenario: A payload that looks like Gherkin",
      "    Given a request body",
      '      """',
      "      Given this is not a step",
      "      When neither is this",
      '      """',
      "    When it is sent",
      "    Then it is accepted",
      "",
    ].join("\n"),

    "spanish dialect": [
      "# language: es",
      "Característica: Facturación",
      "  Escenario: Emitir una factura",
      "    Dado un cliente",
      "    Cuando se emite la factura",
      "    Entonces se emite InvoiceIssued",
      "",
    ].join("\n"),

    "portuguese dialect": [
      "# language: pt",
      "Funcionalidade: Cobrança",
      "  Cenário: Emitir uma fatura",
      "    Dado um cliente",
      "    Quando a fatura é emitida",
      "    Então InvoiceIssued é emitido",
      "",
    ].join("\n"),

    "example is a synonym for scenario": [
      "Feature: Synonyms",
      "  Example: Example means Scenario",
      "    Given a thing",
      "    When it happens",
      "    Then it works",
      "",
    ].join("\n"),
  };

  const disagreements: string[] = [];
  for (const [name, source] of Object.entries(cases)) {
    const reference = referenceShape(source);
    const ours = ourShape(source);
    if (JSON.stringify(ours) !== JSON.stringify(reference)) {
      disagreements.push(
        `${name}\n      ours:      ${JSON.stringify(ours)}\n      cucumber:  ${JSON.stringify(reference)}`
      );
    }
  }
  assert.deepEqual(disagreements, [], `\n\n    ${disagreements.join("\n\n    ")}`);
});

test("upper-case keywords are not steps, in ours as in Cucumber", () => {
  // H14 in one assertion. Being lenient here is what shipped 27 scenarios that
  // executed nothing, so the agreement is pinned rather than left implied.
  const shouting = [
    "Feature: Shouting",
    "  Scenario: Keywords in caps",
    "    GIVEN a flag",
    "    WHEN evaluated",
    "    THEN it works",
    "",
  ].join("\n");

  assert.deepEqual(ourShape(shouting), referenceShape(shouting));
  assert.equal(ourShape(shouting).scenarios[0].steps.length, 0, "GIVEN is prose, not a step");
});
