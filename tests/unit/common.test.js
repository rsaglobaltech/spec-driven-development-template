"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const os = require("node:os");
const fs = require("node:fs");

const {
  renderTemplate,
  normalizeVars,
  asArray,
  formatList,
  entityLabel,
  loadPack,
  validatePackModel,
  safeResolve,
  parseTraceabilityRows,
  buildTraceabilityMarkdown,
  hasStructuredDomainModel,
} = require("../../scripts/domain-pack/common");

const FIXTURE_ROOT = path.resolve(__dirname, "../fixtures/domain-packs");
const FIXTURE_ID = "parking-management/backend";

// ── renderTemplate ────────────────────────────────────────────────────────────

test("renderTemplate substitutes a single variable", () => {
  const result = renderTemplate("Hello {{NAME}}!", { NAME: "World" });
  assert.equal(result, "Hello World!");
});

test("renderTemplate substitutes multiple variables", () => {
  const result = renderTemplate("{{A}} + {{B}} = {{C}}", { A: "1", B: "2", C: "3" });
  assert.equal(result, "1 + 2 = 3");
});

test("renderTemplate substitutes the same variable appearing twice", () => {
  const result = renderTemplate("{{X}} and {{X}}", { X: "repeat" });
  assert.equal(result, "repeat and repeat");
});

test("renderTemplate coerces number values to string", () => {
  const result = renderTemplate("port={{PORT}}", { PORT: 5432 });
  assert.equal(result, "port=5432");
});

test("renderTemplate leaves text without placeholders unchanged", () => {
  const result = renderTemplate("no placeholders", { UNUSED: "x" });
  assert.equal(result, "no placeholders");
});

test("renderTemplate throws when a required variable is missing", () => {
  assert.throws(() => renderTemplate("Hello {{MISSING}}!", {}), /MISSING/);
});

test("renderTemplate handles special characters in replacement values", () => {
  const result = renderTemplate("pw={{PW}}", { PW: "p@$$w0rd!" });
  assert.equal(result, "pw=p@$$w0rd!");
});

test("renderTemplate handles slashes in replacement values", () => {
  const result = renderTemplate("path={{P}}", { P: "a/b/c" });
  assert.equal(result, "path=a/b/c");
});

test("renderTemplate is idempotent given the same input", () => {
  const tpl = "service={{SVC}}, env={{ENV}}";
  const vars = { SVC: "api", ENV: "dev" };
  assert.equal(renderTemplate(tpl, vars), renderTemplate(tpl, vars));
});

// ── normalizeVars ─────────────────────────────────────────────────────────────

test("normalizeVars returns merged vars when all required keys are present", () => {
  const result = normalizeVars(["A", "B"], { A: "1", B: "2", C: "extra" });
  assert.equal(result.A, "1");
  assert.equal(result.B, "2");
  assert.equal(result.C, "extra");
});

test("normalizeVars throws when a required variable is absent", () => {
  assert.throws(() => normalizeVars(["MISSING"], {}), /MISSING/);
});

test("normalizeVars throws when a required variable is empty string", () => {
  assert.throws(() => normalizeVars(["NAME"], { NAME: "" }), /NAME/);
});

test("normalizeVars accepts zero required variables", () => {
  const result = normalizeVars([], { A: "1" });
  assert.equal(result.A, "1");
});

// ── asArray ───────────────────────────────────────────────────────────────────

test("asArray wraps a scalar in an array", () => {
  assert.deepEqual(asArray("x"), ["x"]);
});

test("asArray returns an existing array unchanged", () => {
  assert.deepEqual(asArray(["a", "b"]), ["a", "b"]);
});

test("asArray returns empty array for undefined", () => {
  assert.deepEqual(asArray(undefined), []);
});

test("asArray returns empty array for null", () => {
  assert.deepEqual(asArray(null), []);
});

// ── formatList ────────────────────────────────────────────────────────────────

test("formatList joins an array with commas", () => {
  assert.equal(formatList(["a", "b", "c"]), "a, b, c");
});

test("formatList returns fallback for empty array", () => {
  assert.equal(formatList([]), "-");
});

test("formatList returns fallback for undefined", () => {
  assert.equal(formatList(undefined), "-");
});

test("formatList accepts a custom fallback", () => {
  assert.equal(formatList([], "n/a"), "n/a");
});

// ── entityLabel ───────────────────────────────────────────────────────────────

test("entityLabel returns id + name when both present", () => {
  assert.equal(entityLabel({ id: "EVT-001", name: "Created" }), "EVT-001 Created");
});

test("entityLabel returns id when name is absent", () => {
  assert.equal(entityLabel({ id: "EVT-001" }), "EVT-001");
});

test("entityLabel returns name when id is absent", () => {
  assert.equal(entityLabel({ name: "Created" }), "Created");
});

test("entityLabel returns fallback when entity is empty", () => {
  assert.equal(entityLabel({}), "-");
});

// ── loadPack + validatePackModel (integration) ────────────────────────────────

test("loadPack reads the parking-management fixture without error", () => {
  const { pack } = loadPack(FIXTURE_ROOT, FIXTURE_ID);
  assert.equal(pack.metadata.project_type, "backend");
  assert.ok(Array.isArray(pack.requirements));
  assert.ok(pack.requirements.length > 0);
});

test("validatePackModel accepts the parking-management fixture", () => {
  const { pack, packRoot } = loadPack(FIXTURE_ROOT, FIXTURE_ID);
  assert.doesNotThrow(() => validatePackModel(pack, packRoot));
});

test("validatePackModel rejects a pack with no requirements", () => {
  const { pack, packRoot } = loadPack(FIXTURE_ROOT, FIXTURE_ID);
  pack.requirements = [];
  assert.throws(() => validatePackModel(pack, packRoot));
});

test("validatePackModel rejects a pack with duplicate requirement ids", () => {
  const { pack, packRoot } = loadPack(FIXTURE_ROOT, FIXTURE_ID);
  pack.requirements.push({ ...pack.requirements[0] });
  assert.throws(() => validatePackModel(pack, packRoot));
});

// ── safeResolve ───────────────────────────────────────────────────────────────

test("safeResolve returns absolute path within project dir", () => {
  const tmp = os.tmpdir();
  const result = safeResolve(tmp, "docs/spec.md");
  assert.equal(result, path.resolve(tmp, "docs/spec.md"));
});

test("safeResolve throws on path traversal attempt", () => {
  const tmp = os.tmpdir();
  assert.throws(() => safeResolve(tmp, "../outside"), /escapes|Invalid/);
});

test("safeResolve throws on absolute path input", () => {
  const tmp = os.tmpdir();
  assert.throws(() => safeResolve(tmp, "/etc/passwd"), /Invalid target path/);
});

// ── parseTraceabilityRows ─────────────────────────────────────────────────────

const LEGACY_MATRIX = `
# Traceability Matrix

| Feature | Scenario | Technical Artifact | Status |
|---|---|---|---|
| Login | User logs in | AuthService | Verified |
| Login | User logs in | AuthService | Verified |
| Logout | User logs out | AuthService | Draft |
`.trim();

const RICH_MATRIX = `
# Traceability Matrix

| Requirement | Scenario ID | Feature File | Use Case | Command | Aggregate | Event | Technical Artifact | Test Artifact | Status |
|---|---|---|---|---|---|---|---|---|---|
| REQ-001 | SCN-001 | features/login.feature | UC-001 | LoginCmd | UserSession | UserLoggedIn | AuthService | login.steps | Verified |
`.trim();

test("parseTraceabilityRows detects legacy mode", () => {
  const { mode } = parseTraceabilityRows(LEGACY_MATRIX);
  assert.equal(mode, "legacy");
});

test("parseTraceabilityRows parses legacy rows", () => {
  const { rows } = parseTraceabilityRows(LEGACY_MATRIX);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].feature, "Login");
  assert.equal(rows[0].status, "Verified");
});

test("parseTraceabilityRows deduplicates legacy rows by feature+scenario key", () => {
  const { rows } = parseTraceabilityRows(LEGACY_MATRIX);
  const loginRows = rows.filter((r) => r.feature === "Login");
  assert.equal(loginRows.length, 1);
});

test("parseTraceabilityRows detects rich mode", () => {
  const { mode } = parseTraceabilityRows(RICH_MATRIX);
  assert.equal(mode, "rich");
});

test("parseTraceabilityRows parses rich rows", () => {
  const { rows } = parseTraceabilityRows(RICH_MATRIX);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requirement, "REQ-001");
  assert.equal(rows[0].scenarioId, "SCN-001");
  assert.equal(rows[0].status, "Verified");
});

test("parseTraceabilityRows returns empty rows for empty input", () => {
  const { rows } = parseTraceabilityRows("");
  assert.equal(rows.length, 0);
});

// ── buildTraceabilityMarkdown ─────────────────────────────────────────────────

test("buildTraceabilityMarkdown produces a markdown table in legacy mode", () => {
  const rows = [{ feature: "Login", scenario: "Success", technicalArtifact: "AuthService", status: "Draft" }];
  const md = buildTraceabilityMarkdown(rows, "legacy");
  assert.ok(md.includes("| Login |"));
  assert.ok(md.includes("Draft"));
});

test("buildTraceabilityMarkdown produces rich headers in rich mode", () => {
  const rows = [{
    requirement: "REQ-001", scenarioId: "SCN-001", featureFile: "login.feature",
    useCase: "UC-001", commandOrQuery: "LoginCmd", aggregate: "Session",
    event: "LoggedIn", technicalArtifact: "AuthSvc", testArtifact: "login.steps", status: "Draft",
  }];
  const md = buildTraceabilityMarkdown(rows, "rich");
  assert.ok(md.includes("REQ-001"));
  assert.ok(md.includes("SCN-001"));
});

test("buildTraceabilityMarkdown returns empty-table string for zero rows", () => {
  const md = buildTraceabilityMarkdown([], "legacy");
  assert.ok(typeof md === "string");
});

// ── hasStructuredDomainModel ──────────────────────────────────────────────────

test("hasStructuredDomainModel returns true when all sections present", () => {
  const { pack } = loadPack(FIXTURE_ROOT, FIXTURE_ID);
  assert.ok(hasStructuredDomainModel(pack));
});

test("hasStructuredDomainModel returns false when all domain sections absent", () => {
  assert.equal(hasStructuredDomainModel({}), false);
});

test("hasStructuredDomainModel returns true when any domain section is non-empty", () => {
  assert.equal(hasStructuredDomainModel({ requirements: [{ id: "REQ-001" }] }), true);
});
