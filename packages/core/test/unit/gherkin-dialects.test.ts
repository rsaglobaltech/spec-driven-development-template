/**
 * The vendored keyword table, checked against the official one.
 *
 * `GherkinDialects.ts` is data copied out of `@cucumber/gherkin` so the CLI can
 * read Gherkin without a runtime dependency — `package.json` has none, and it
 * runs through `npx` on other people's machines, so that is a structural
 * promise rather than a preference.
 *
 * The price of vendoring is drift, and this is where it gets paid: every entry
 * is compared with the installed official table, so bumping Cucumber either
 * passes or says exactly which keyword moved. Without this file the table is a
 * copy that slowly stops being one.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { DEFAULT_DIALECT, DIALECT_TABLE_VERSION, DIALECTS } from "../../src/domain/GherkinDialects";

const official = require("@cucumber/gherkin/dist/gherkin-languages.json");
const installedVersion = require("@cucumber/gherkin/package.json").version;

const KEYS = [
  "feature",
  "background",
  "rule",
  "scenario",
  "scenarioOutline",
  "examples",
  "given",
  "when",
  "then",
  "and",
  "but",
] as const;

test("every vendored dialect matches the official table, keyword for keyword", () => {
  const drift: string[] = [];

  for (const [tag, dialect] of Object.entries(DIALECTS)) {
    const source = official[tag];
    if (!source) {
      drift.push(`${tag}: no longer exists in the official table`);
      continue;
    }
    if (dialect.name !== source.name || dialect.native !== source.native) {
      drift.push(`${tag}: name/native changed — ${source.name} / ${source.native}`);
    }
    for (const key of KEYS) {
      const ours = [...dialect[key]];
      const theirs = [...(source[key] ?? [])];
      if (JSON.stringify(ours) !== JSON.stringify(theirs)) {
        drift.push(
          `${tag}.${key}: vendored ${JSON.stringify(ours)} vs official ${JSON.stringify(theirs)}`
        );
      }
    }
  }

  assert.deepEqual(
    drift,
    [],
    "\n  The vendored table has drifted from @cucumber/gherkin. Regenerate it from\n" +
      "  node_modules/@cucumber/gherkin/dist/gherkin-languages.json rather than\n" +
      `  editing by hand:\n  ${drift.join("\n  ")}`
  );
});

test("the table records which version it was taken from", () => {
  // Not an equality check: the point is that the recorded version is the one
  // the drift check above ran against, so a passing suite means the table
  // matches *this* Cucumber, and the number in the file says which.
  assert.equal(
    DIALECT_TABLE_VERSION,
    installedVersion,
    "the vendored table names a different version than the one installed — regenerate it"
  );
});

test("the dialects the CLI offers are the dialects it can parse", () => {
  // `csda init` takes LANG en / es / pt. A language the scaffolder offers and
  // the parser does not know would produce files the tool cannot read back.
  for (const tag of ["en", "es", "pt"]) {
    assert.ok(DIALECTS[tag], `${tag} is offered by init but missing from the table`);
  }
  assert.ok(DIALECTS[DEFAULT_DIALECT], "the default dialect must exist");
});

test("step keywords keep the trailing space the table gives them", () => {
  // `"Given "` ends in a space on purpose: it is what stops `Givenchy` from
  // parsing as a step. Trimming the table would silently widen every keyword.
  for (const [tag, dialect] of Object.entries(DIALECTS)) {
    for (const kind of ["given", "when", "then", "and", "but"] as const) {
      for (const keyword of dialect[kind]) {
        assert.ok(
          keyword.endsWith(" "),
          `${tag}.${kind}: ${JSON.stringify(keyword)} lost its trailing space`
        );
      }
    }
  }
});
