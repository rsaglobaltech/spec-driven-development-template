// csda:allow-placeholders — this file emits or asserts on {{VAR}} template syntax.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "../../..");
const CLI_PATH = path.join(ROOT_DIR, "bin", "create-spec-driven-app.js");

const RICH_HEADER =
  "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |";

function cli(...args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
}

function makeHealthyProject(tmp) {
  const dir = path.join(tmp, "project");
  fs.mkdirSync(path.join(dir, "features"), { recursive: true });
  fs.mkdirSync(path.join(dir, "docs", "specs", "adr"), { recursive: true });
  fs.writeFileSync(path.join(dir, "spec.md"), "# Spec\n\n## REQ-001 — Health\n", "utf8");
  fs.writeFileSync(path.join(dir, "AI_RULES.md"), "# Rules\n", "utf8");
  fs.writeFileSync(path.join(dir, "README.md"), "# Readme\n", "utf8");
  fs.writeFileSync(path.join(dir, "docs", "specs", "adr", "README.md"), "# ADRs\n", "utf8");
  fs.writeFileSync(
    path.join(dir, "features", "health.feature"),
    "Feature: Health\n  Scenario: ok\n    Given up\n    Then 200\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(dir, "docs", "specs", "traceability.md"),
    [
      "# Traceability Matrix",
      "",
      RICH_HEADER,
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| REQ-001 | SCN-001 | `features/health.feature` | UC-001 | - | - | - | - | TBD | Draft |",
      "",
    ].join("\n"),
    "utf8"
  );
  return dir;
}

function withProject(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "csda-doctor-"));
  try {
    return fn(makeHealthyProject(tmp), tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("doctor passes on a healthy project", () => {
  withProject((dir) => {
    const r = cli("doctor", "--project-dir", dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /✅ Node\.js/);
    assert.match(r.stdout, /✅ SDD structure/);
    assert.match(r.stdout, /0 error\(s\)/);
  });
});

test("doctor reports ALL problems at once, each with a fix", () => {
  withProject((dir) => {
    // Problem 1: orphan feature (no matrix row).
    fs.writeFileSync(
      path.join(dir, "features", "orphan.feature"),
      "Feature: Orphan\n  Scenario: o\n    Given x\n    Then y\n",
      "utf8"
    );
    // Problem 2: dangling matrix row (feature file deleted).
    fs.appendFileSync(
      path.join(dir, "docs", "specs", "traceability.md"),
      "| REQ-002 | SCN-002 | `features/gone.feature` | UC-002 | - | - | - | - | TBD | Draft |\n"
    );
    // Problem 3: unresolved placeholder.
    fs.appendFileSync(path.join(dir, "AI_RULES.md"), "\nStack: {{STACK}}\n");

    const r = cli("doctor", "--project-dir", dir);
    assert.equal(r.status, 1);
    // All three reported in a single run (validate would stop at the first).
    assert.match(r.stdout, /orphan feature: features\/orphan\.feature/);
    assert.match(r.stdout, /dangling matrix row: .*features\/gone\.feature/);
    assert.match(r.stdout, /placeholders: unresolved .* in AI_RULES\.md/);
    // Every error line is followed by a fix.
    const errorCount = (r.stdout.match(/❌ /g) || []).length - 1; // minus summary line
    const fixCount = (r.stdout.match(/💡 Fix:/g) || []).length;
    assert.ok(fixCount >= errorCount, `expected >= ${errorCount} fixes, got ${fixCount}`);
  });
});

test("doctor warns on spec/matrix requirement drift in both directions", () => {
  withProject((dir) => {
    fs.appendFileSync(path.join(dir, "spec.md"), "\n## REQ-010 — Only in spec\n");
    fs.appendFileSync(
      path.join(dir, "docs", "specs", "traceability.md"),
      "| REQ-020 | SCN-020 | `features/health.feature` | UC-020 | - | - | - | - | TBD | Draft |\n"
    );
    const r = cli("doctor", "--project-dir", dir);
    assert.equal(r.status, 0, "drift is a warning, not an error");
    assert.match(r.stdout, /REQ-010 is in spec\.md but has no traceability row/);
    assert.match(r.stdout, /REQ-020 is in traceability\.md but spec\.md has no section/);
  });
});

test("doctor on a non-spec-driven directory points to adopt/init", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "csda-doctor-bare-"));
  try {
    const r = cli("doctor", "--project-dir", tmp);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /not spec-driven yet/);
    assert.match(r.stdout, /adopt/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("doctor flags a corrupt .specops.lock", () => {
  withProject((dir) => {
    fs.writeFileSync(path.join(dir, ".specops.lock"), "{not json", "utf8");
    const r = cli("doctor", "--project-dir", dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /\.specops\.lock is not valid JSON/);
    assert.match(r.stdout, /💡 Fix: Restore it from git history/);
  });
});
