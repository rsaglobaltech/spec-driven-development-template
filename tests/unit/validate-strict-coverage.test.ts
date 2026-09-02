"use strict";

/**
 * #168 at the CLI, which is where the defect lived.
 *
 * A feature file declaring three scenarios with tests covering two passed
 * --strict-tdd, --strict-scenarios and --strict-links all at once, with the row
 * on `Implemented`. The domain rules are unit-tested in
 * packages/core/test/unit/scenario-coverage.test.ts; this pins the wiring.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = require("node:path").resolve(
  __dirname.split(/[\\/]tests(?:[\\/]|$)/)[0].replace(/[\\/]dist$/, "")
);
const CLI_PATH = path.join(ROOT_DIR, "bin", "specgate.js");

function cli(...args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd: ROOT_DIR, encoding: "utf8" });
}

const FEATURE = `Feature: Invoice totals

  Scenario: SCN-010 subtotal is the sum of line amounts
    Given two lines
    When the invoice is totalled
    Then the subtotal is their sum

  Scenario: SCN-012 a fully discounted invoice carries no tax
    Given a 100% discount
    When the invoice is totalled
    Then the tax is zero
`;

function project(testFileBody) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "csda-coverage-"));
  const r = cli("init", "--yes", "--out", parent, "--no-git", "--no-sample-req");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dir = path.join(parent, "my-spec-driven-app");

  fs.mkdirSync(path.join(dir, "features/billing"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "features/billing/totals.feature"), FEATURE);
  fs.writeFileSync(path.join(dir, "src/totals.js"), "export const t = () => ({});\n");
  fs.writeFileSync(path.join(dir, "tests/totals.test.js"), testFileBody);

  const trace = path.join(dir, "docs/specs/traceability.md");
  fs.appendFileSync(
    trace,
    "\n| REQ-010 | SCN-010 | `features/billing/totals.feature` | UC-010 Totals | - | - | - |" +
      " src/totals.js | tests/totals.test.js | Implemented |\n"
  );
  return { parent, dir };
}

test("a declared scenario that no test names fails --strict-coverage", () => {
  const { parent, dir } = project(
    'test("SCN-010 subtotal is the sum of line amounts", () => {});\n'
  );
  try {
    const r = cli("validate", dir, "--strict-coverage");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const out = r.stdout + r.stderr;
    assert.match(out, /scenario_not_covered/);
    assert.match(out, /fully discounted/);
    assert.match(out, /SCN-012/, "the fix must name what to add");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("the same project passes once every scenario is named", () => {
  const { parent, dir } = project(
    'test("SCN-010 subtotal", () => {});\ntest("SCN-012 fully discounted", () => {});\n'
  );
  try {
    const r = cli("validate", dir, "--strict-coverage");
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("the older gates stay green — the check is opt-in on purpose", () => {
  // A project that names its tests some other way must not start failing
  // because a new release shipped a heuristic.
  const { parent, dir } = project(
    'test("SCN-010 subtotal is the sum of line amounts", () => {});\n'
  );
  try {
    for (const flags of [[], ["--strict-tdd"], ["--strict-scenarios"], ["--strict-links"]]) {
      const r = cli("validate", dir, ...flags);
      assert.equal(r.status, 0, `${flags.join(" ")} should still pass:\n${r.stdout}${r.stderr}`);
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("a TBD test artifact is --strict-tdd's finding, not reported twice here", () => {
  const { parent, dir } = project("// nothing\n");
  try {
    const trace = path.join(dir, "docs/specs/traceability.md");
    fs.writeFileSync(
      trace,
      fs.readFileSync(trace, "utf8").replace("tests/totals.test.js | Implemented", "TBD | Draft")
    );
    const r = cli("validate", dir, "--strict-coverage");
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("--strict-coverage is a declared flag, not one that slips through", () => {
  const r = cli("validate", ".", "--strict-coverageX");
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /Unknown flag/);
});
