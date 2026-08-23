/**
 * `parseYamlLite`, and the quoting it did not do (E1).
 *
 * The parser is a deliberate YAML subset: this package has no runtime
 * dependencies, because the CLI runs through `npx` on other people's machines.
 * `schemas/pack.schema.json` is the authority on the format; this only has to
 * read it faithfully.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { parseYamlLite } from "../../src/domain/YamlLite";

// ── Commas inside quotes are not separators (E1) ─────────────────────────────
//
// ADR-0020 taught this parser to read inline flow sequences, because the packs
// use them 54 times and they had been parsing as the literal string
// `"[Invoice]"`. What it did not teach it was quoting: the split ran on every
// comma, so one quoted phrase became several items, each carrying a stray quote
// character.
//
// `splitKeyValue` in this same file already tracks quotes properly. The flow
// branch simply did not use it — which is how a shipped pack ended up declaring
// four responsibilities where it wrote one.

test("a quoted item survives the commas inside it", () => {
  // Measured on `packs/billing/backend`, which writes exactly this:
  //   responsibilities: ["Invoice line items, totals, status, aging"]
  // and got back four items, the first `"Invoice line items` and the last
  // `aging"`.
  assert.deepEqual(parseYamlLite('a: ["Invoice line items, totals, status, aging"]').a, [
    "Invoice line items, totals, status, aging",
  ]);
  assert.deepEqual(parseYamlLite("a: ['x, y']").a, ["x, y"]);
});

test("quoted and bare items mix in one sequence", () => {
  assert.deepEqual(parseYamlLite('a: ["one, two", three]').a, ["one, two", "three"]);
  assert.deepEqual(parseYamlLite('a: [three, "one, two"]').a, ["three", "one, two"]);
});

test("the ordinary case keeps working", () => {
  // The reason the flow branch exists at all.
  assert.deepEqual(parseYamlLite("a: [Invoice, Payment]").a, ["Invoice", "Payment"]);
  assert.deepEqual(parseYamlLite("a: []").a, []);
  assert.deepEqual(parseYamlLite("a: [one]").a, ["one"]);
});
