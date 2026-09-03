"use strict";

/**
 * Round 2 sent a verdict backwards, and this is why.
 *
 * A cold evaluator counted ten places calling `--strict-tdd` "the gate" — the
 * quickstart, `adopt`'s epilogue, the generated AI_RULES.md, `harness init`,
 * the harness prompt — while `ci init` alone emitted the stronger command.
 * Anyone following any of the ten got a check that passes on an `Implemented`
 * requirement whose test file does not exist. Round 1 fixed `ci init` and left
 * the other nine, which made the right one look like the mistake.
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
  return spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf8" });
}

test("--strict means every strict check, so a rotted link cannot pass it", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "csda-gate-"));
  try {
    assert.equal(cli("init", "--yes", "--out", parent, "--no-git").status, 0);
    const dir = path.join(parent, "my-spec-driven-app");

    fs.appendFileSync(
      path.join(dir, "docs/specs/traceability.md"),
      "\n| REQ-050 | - | - | UC-050 Gone | - | - | - | src/nope.js | tests/does/not/Exist.js |" +
        " Implemented |\n"
    );

    // The measured trap: the flag nine places called "the gate" is green here.
    assert.equal(cli("validate", dir, "--strict-tdd").status, 0);
    // The one name that is the gate is not.
    assert.equal(cli("validate", dir, "--strict").status, 1);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("nothing tells a user to run a weaker gate than --strict", () => {
  // Fixing the wording in ten places would have left the same trap for the
  // eleventh, so the check is that no shipped text recommends the old command.
  const shipped = [
    "docs/quickstart.md",
    "templates/adopt/AI_RULES.md.tpl",
    "templates/ci/github.yml.tpl",
    "templates/ci/gitlab.yml.tpl",
    "templates/ci/azure.yml.tpl",
    "templates/ci/jenkins.tpl",
  ];
  for (const rel of shipped) {
    const body = fs.readFileSync(path.join(ROOT_DIR, rel), "utf8");
    assert.ok(
      !/validate[^\n]*--strict-tdd(?![\w-])/.test(body),
      `${rel} still recommends --strict-tdd as the gate`
    );
  }
});

test("a freshly generated project passes --strict", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "csda-gate-fresh-"));
  try {
    assert.equal(cli("init", "--yes", "--out", parent, "--no-git").status, 0);
    const r = cli("validate", path.join(parent, "my-spec-driven-app"), "--strict");
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("--strict is a declared flag", () => {
  const r = cli("validate", ".", "--strictX");
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /Unknown flag/);
});

// ── The gate must not contradict `adopt`'s promise ───────────────────────────

test("a brownfield link to a pre-existing test does not force a source edit", () => {
  // The regression round 2 found: every retro-fitted row failed
  // `link_without_evidence`, and the only fix was to write REQ-006 into
  // somebody's existing test — the one thing `adopt` promises never to make
  // you do. A gate that contradicts the product's headline promise is a reason
  // to stop using the product.
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "csda-brown-"));
  const dir = path.join(parent, "app");
  try {
    fs.mkdirSync(path.join(dir, "src/main/java"), { recursive: true });
    fs.mkdirSync(path.join(dir, "src/test/java"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "pom.xml"),
      "<project><artifactId>petclinic</artifactId></project>"
    );
    fs.writeFileSync(path.join(dir, "src/main/java/Owner.java"), "class Owner {}\n");
    fs.writeFileSync(
      path.join(dir, "src/test/java/OwnerTests.java"),
      "class OwnerTests { void telephoneIsTenDigits() {} }\n"
    );
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "i"], {
      cwd: dir,
    });

    assert.equal(cli("adopt", "--project-dir", dir).status, 0);
    const added = cli("req", "add", "Owner telephone must be ten digits", "--project-dir", dir);
    const reqId = /Added (REQ-\d+)/.exec(added.stdout)[1];
    assert.equal(
      cli(
        "req",
        "link",
        reqId,
        "--code",
        "src/main/java/Owner.java",
        "--test",
        "src/test/java/OwnerTests.java",
        "--project-dir",
        dir
      ).status,
      0
    );

    const r = cli("validate", dir, "--strict-coverage");
    assert.equal(r.status, 0, `a retro-fitted link must not fail:\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout + r.stderr, /could not run/, "and it must say why it did not check");

    const dirty = spawnSync("git", ["status", "--short", "--", "src"], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.equal(dirty.stdout.trim(), "", "the gate must not have required a source edit");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("once a project uses the convention, the check holds every row to it", () => {
  // Calibration, not abdication: the skipped scenario is still caught.
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "csda-conv-"));
  try {
    assert.equal(cli("init", "--yes", "--out", parent, "--no-git", "--no-sample-req").status, 0);
    const dir = path.join(parent, "my-spec-driven-app");
    fs.mkdirSync(path.join(dir, "features/billing"), { recursive: true });
    fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "features/billing/totals.feature"),
      "Feature: Totals\n\n  Scenario: SCN-010 subtotal\n    Given a\n    When b\n    Then c\n\n" +
        "  Scenario: SCN-012 discounted\n    Given a\n    When b\n    Then c\n"
    );
    fs.writeFileSync(path.join(dir, "src/totals.js"), "export const t = () => ({});\n");
    fs.writeFileSync(path.join(dir, "tests/totals.test.js"), "// SCN-010 subtotal\n");
    fs.appendFileSync(
      path.join(dir, "docs/specs/traceability.md"),
      "\n| REQ-010 | SCN-010 | `features/billing/totals.feature` | UC-010 Totals | - | - | - |" +
        " src/totals.js | tests/totals.test.js | Draft |\n"
    );

    const r = cli("validate", dir, "--strict-coverage");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /SCN-012/, "the skipped scenario is still caught");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
