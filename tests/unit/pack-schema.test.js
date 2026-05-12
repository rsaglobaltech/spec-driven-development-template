"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv = require("ajv/dist/2020");

const ROOT = path.resolve(__dirname, "../..");
const schemaPath = path.join(ROOT, "schemas", "pack.schema.json");
const FIXTURE_ROOT = path.join(ROOT, "tests/fixtures/domain-packs");
const FIXTURE_ID = "parking-management/backend";

const { loadPack } = require("../../scripts/domain-pack/common");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ strict: false, allErrors: true });
const validate = ajv.compile(schema);

function fixture() {
  return loadPack(FIXTURE_ROOT, FIXTURE_ID).pack;
}

// --- Happy path ---

test("parking-management fixture passes the JSON Schema", () => {
  const pack = fixture();
  const valid = validate(pack);
  if (!valid) {
    assert.fail(
      "Schema errors:\n" + validate.errors.map((e) => `  ${e.instancePath} ${e.message}`).join("\n")
    );
  }
  assert.ok(valid);
});

// --- schema_version ---

test("rejects pack with missing schema_version", () => {
  const pack = fixture();
  delete pack.schema_version;
  assert.equal(validate(pack), false);
});

test("rejects pack with non-SemVer schema_version", () => {
  const pack = fixture();
  pack.schema_version = "v1";
  assert.equal(validate(pack), false);
});

// --- metadata ---

test("rejects unsupported project_type", () => {
  const pack = fixture();
  pack.metadata.project_type = "mobile";
  assert.equal(validate(pack), false);
});

test("rejects missing metadata.name", () => {
  const pack = fixture();
  delete pack.metadata.name;
  assert.equal(validate(pack), false);
});

// --- requirements ---

test("rejects requirement with invalid priority", () => {
  const pack = fixture();
  pack.requirements[0].priority = "Nice to have";
  assert.equal(validate(pack), false);
});

test("rejects requirement with invalid status", () => {
  const pack = fixture();
  pack.requirements[0].status = "Unknown";
  assert.equal(validate(pack), false);
});

test("rejects requirement id not matching REQ-NNN pattern", () => {
  const pack = fixture();
  pack.requirements[0].id = "R-1";
  assert.equal(validate(pack), false);
});

// --- events ---

test("rejects event with invalid type", () => {
  const pack = fixture();
  pack.events[0].type = "external";
  assert.equal(validate(pack), false);
});

test("rejects event with empty payload", () => {
  const pack = fixture();
  pack.events[0].payload = [];
  assert.equal(validate(pack), false);
});

// --- commands ---

test("rejects command name not ending in Command", () => {
  const pack = fixture();
  pack.commands[0].name = "CheckCapacityThreshold";
  assert.equal(validate(pack), false);
});

// --- scenarios ---

test("rejects scenario id not matching SCN-NNN pattern", () => {
  const pack = fixture();
  pack.scenarios[0].id = "SCEN-001";
  assert.equal(validate(pack), false);
});

// --- bounded_contexts ---

test("rejects bounded context with invalid type", () => {
  const pack = fixture();
  pack.bounded_contexts[0].type = "Peripheral";
  assert.equal(validate(pack), false);
});
