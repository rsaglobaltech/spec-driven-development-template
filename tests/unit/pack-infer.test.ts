"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  parseFeatureFile,
  toPascalCase,
  collectRequirementIds,
  extractEventNames,
  inferModel,
  renderYamlFragment,
} = require("../../scripts/infer_pack");

const FEATURE = `@REQ-001
Feature: Parking Capacity

  Scenario: Triggering alert when occupancy reaches threshold
    Given a parking facility "Lot-A" with total capacity of "200" spots
    And current occupancy is "180" vehicles
    When 10 more vehicles enter the facility
    Then occupancy should become "190" vehicles
    And a "CapacityThresholdReached" event should be emitted
`;

// ── parseArgs ────────────────────────────────────────────────────────────────

test("parseArgs reads --from and defaults --format to yaml", () => {
  const opts = parseArgs(["--from", "x.feature"]);
  assert.equal(opts.from, "x.feature");
  assert.equal(opts.format, "yaml");
});

test("parseArgs accepts --format json", () => {
  assert.equal(parseArgs(["--from", "x", "--format", "json"]).format, "json");
});

// ── parseFeatureFile ─────────────────────────────────────────────────────────

test("parseFeatureFile extracts feature name, tags and scenario steps", () => {
  const parsed = parseFeatureFile(FEATURE);
  assert.equal(parsed.featureName, "Parking Capacity");
  assert.deepEqual(parsed.featureTags, ["@REQ-001"]);
  assert.equal(parsed.scenarios.length, 1);
  assert.equal(parsed.scenarios[0].title, "Triggering alert when occupancy reaches threshold");
  const kinds = parsed.scenarios[0].steps.map((s) => s.keyword);
  // And after Given inherits given; And after Then inherits then.
  assert.deepEqual(kinds, ["given", "given", "when", "then", "then"]);
});

// ── toPascalCase ─────────────────────────────────────────────────────────────

test("toPascalCase drops quoted literals and bare numbers", () => {
  assert.equal(toPascalCase("10 more vehicles enter the facility"), "MoreVehiclesEnterThe");
  assert.equal(toPascalCase('register entry for "ABC-123"'), "RegisterEntryFor");
  assert.equal(toPascalCase('"123"'), "Action");
});

// ── collectRequirementIds ────────────────────────────────────────────────────

test("collectRequirementIds picks REQ ids out of tags", () => {
  const parsed = parseFeatureFile(FEATURE);
  assert.deepEqual(collectRequirementIds(parsed), ["REQ-001"]);
});

test("collectRequirementIds returns [] when no REQ tag is present", () => {
  const parsed = parseFeatureFile("Feature: F\n  Scenario: s\n    When x\n    Then y\n");
  assert.deepEqual(collectRequirementIds(parsed), []);
});

// ── extractEventNames ────────────────────────────────────────────────────────

test("extractEventNames returns quoted PascalCase tokens only", () => {
  assert.deepEqual(extractEventNames('a "CapacityThresholdReached" event should be emitted'), [
    "CapacityThresholdReached",
  ]);
  // A quoted number or lowercase literal is data, not an event.
  assert.deepEqual(extractEventNames('occupancy should become "190" vehicles'), []);
});

// ── inferModel ───────────────────────────────────────────────────────────────

test("inferModel references the REQ tag and proposes command + event", () => {
  const model = inferModel(parseFeatureFile(FEATURE), "capacity.feature");
  assert.deepEqual(
    model.requirements.map((r) => r.id),
    ["REQ-001"]
  );
  assert.equal(model.use_cases[0].name, "Parking Capacity");
  assert.equal(model.use_cases[0].requirement, "REQ-001");
  assert.equal(model.commands.length, 1);
  assert.equal(model.commands[0].name, "MoreVehiclesEnterTheCommand");
  assert.deepEqual(
    model.events.map((e) => e.name),
    ["CapacityThresholdReached"]
  );
  assert.equal(model.use_cases[0].command, "MoreVehiclesEnterTheCommand");
  assert.deepEqual(model.use_cases[0].emits, ["CapacityThresholdReached"]);
  assert.equal(model.scenarios[0].id, "SCN-001");
});

test("inferModel falls back to a REQ-XXX placeholder when no tag exists", () => {
  const parsed = parseFeatureFile("Feature: Bare\n  Scenario: s\n    When act\n    Then check\n");
  const model = inferModel(parsed, "bare.feature");
  assert.equal(model.requirements[0].id, "REQ-XXX");
  assert.match(model.requirements[0].title, /TODO:/);
  assert.equal(model.use_cases[0].aggregate, "TODO: aggregate");
});

// ── renderYamlFragment ───────────────────────────────────────────────────────

test("renderYamlFragment emits a parseable, TODO-annotated fragment", () => {
  const model = inferModel(parseFeatureFile(FEATURE), "capacity.feature");
  const yamlText = renderYamlFragment(model, "capacity.feature");
  assert.match(yamlText, /^# Proposed pack\.yaml fragment inferred from capacity\.feature/);
  assert.match(yamlText, /requirements:/);
  assert.match(yamlText, /- id: REQ-001/);
  assert.match(yamlText, /command: MoreVehiclesEnterTheCommand/);
  assert.match(yamlText, /- CapacityThresholdReached/);

  // The fragment must round-trip through the project's YAML reader.
  const { parseYamlLite } = require("../../scripts/domain-pack/common");
  const reparsed = parseYamlLite(yamlText);
  assert.ok(Array.isArray(reparsed.requirements));
  assert.equal(reparsed.requirements[0].id, "REQ-001");
  assert.equal(reparsed.use_cases[0].name, "Parking Capacity");
  assert.equal(reparsed.events[0].name, "CapacityThresholdReached");
});
