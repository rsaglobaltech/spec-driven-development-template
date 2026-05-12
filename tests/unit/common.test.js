"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  renderTemplate,
  normalizeVars,
  asArray,
  formatList,
  entityLabel,
  loadPack,
  validatePackModel,
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
