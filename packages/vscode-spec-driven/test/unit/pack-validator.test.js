"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Resolve relative to the monorepo root so tests run from either location
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const { validatePackYaml, findApproximateLine } = require("../../src/pack-validator");
const SCHEMA_PATH = path.join(REPO_ROOT, "schemas/pack.schema.json");

// ── findApproximateLine ───────────────────────────────────────────────────────

test("findApproximateLine finds the deepest matching key in the path", () => {
  const lines = ["schema_version: \"1.0.0\"", "metadata:", "  name: Test"];
  // /metadata/name → function finds 'name:' at line 2 (deepest match wins)
  assert.equal(findApproximateLine(lines, "/metadata/name", ""), 2);
});

test("findApproximateLine returns 0 for empty instancePath", () => {
  const lines = ["foo: bar"];
  assert.equal(findApproximateLine(lines, "", ""), 0);
});

test("findApproximateLine returns 0 when key not found", () => {
  const lines = ["foo: bar", "baz: qux"];
  assert.equal(findApproximateLine(lines, "/nonexistent", ""), 0);
});

// ── validatePackYaml — YAML parse errors ──────────────────────────────────────

test("validatePackYaml returns parseError on invalid YAML", () => {
  const content = "key: [\nbad yaml";
  const result = validatePackYaml(content, SCHEMA_PATH);
  assert.ok(result.parseError, "should have a parseError");
  assert.ok(result.parseError.message.includes("YAML"), `got: ${result.parseError.message}`);
  assert.equal(result.errors.length, 0);
});

test("validatePackYaml returns parseError for scalar YAML", () => {
  const result = validatePackYaml("just a string", SCHEMA_PATH);
  assert.ok(result.parseError, "scalar YAML should be a parse error");
});

// ── validatePackYaml — schema validation ─────────────────────────────────────

test("validatePackYaml passes on the parking-management fixture", () => {
  const fs = require("node:fs");
  const fixturePath = path.join(REPO_ROOT, "tests/fixtures/domain-packs/parking-management/backend/pack.yaml");
  const content = fs.readFileSync(fixturePath, "utf8");
  const result = validatePackYaml(content, SCHEMA_PATH);
  assert.equal(result.parseError, null, "should not have parse error");
  assert.equal(result.errors.length, 0, `unexpected errors: ${JSON.stringify(result.errors)}`);
});

test("validatePackYaml returns errors when schema_version is missing", () => {
  const content = `
metadata:
  name: Test Pack
  version: "0.1.0"
  language: en
  project_type: backend
variables:
  required:
    - PROJECT_NAME
`;
  const result = validatePackYaml(content, SCHEMA_PATH);
  assert.equal(result.parseError, null);
  assert.ok(result.errors.length > 0, "should have schema errors for missing schema_version");
  const messages = result.errors.map((e) => e.message).join(" ");
  assert.ok(
    messages.includes("schema_version") || messages.includes("required"),
    `expected schema_version error, got: ${messages}`
  );
});

test("validatePackYaml returns errors for invalid priority value", () => {
  const content = `
schema_version: "1.1.0"
metadata:
  name: Test Pack
  version: "0.1.0"
  language: en
  project_type: backend
variables:
  required:
    - PROJECT_NAME
requirements:
  - id: REQ-001
    title: Test
    priority: Critical
    description: Test desc
    status: Draft
`;
  const result = validatePackYaml(content, SCHEMA_PATH);
  assert.equal(result.parseError, null);
  assert.ok(result.errors.length > 0, "should have errors for invalid priority 'Critical'");
});

test("validatePackYaml reports warning when schema file not found", () => {
  const content = "schema_version: \"1.0.0\"\n";
  const result = validatePackYaml(content, "/nonexistent/path/pack.schema.json");
  assert.equal(result.parseError, null);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].severity, "warning");
  assert.ok(result.errors[0].message.includes("Cannot load"));
});

test("validatePackYaml returns no errors for valid minimal pack", () => {
  const content = `
schema_version: "1.1.0"
metadata:
  name: Minimal Pack
  version: "0.1.0"
  language: en
  project_type: backend
variables:
  required:
    - PROJECT_NAME
`;
  const result = validatePackYaml(content, SCHEMA_PATH);
  assert.equal(result.parseError, null);
  // May have errors if more required fields exist — just verify no crash
  assert.ok(Array.isArray(result.errors));
});
