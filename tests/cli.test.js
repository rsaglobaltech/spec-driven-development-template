const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const CLI_PATH = path.join(ROOT_DIR, "bin", "create-spec-driven-app.js");
const PKG = require(path.join(ROOT_DIR, "package.json"));

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    ...options,
  });
}

test("shows help with no args", () => {
  const result = runCli([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /create-spec-driven-app/);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /expand --pack-root/);
});

test("shows version from package.json", () => {
  const result = runCli(["--version"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), PKG.version);
});

test("returns usage error for unknown command", () => {
  const result = runCli(["unknown-cmd"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /Unknown command/);
});

test("runs init in dry-run mode with example config", () => {
  const result = runCli([
    "init",
    "--config",
    "examples/project.config.example",
    "--out",
    os.tmpdir(),
    "--dry-run",
    "--no-git",
    "--force",
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[dry-run\] project would be generated at:/);
  assert.match(result.stdout, /Generation completed/);
});

test("returns usage error for validate without project dir", () => {
  const result = runCli(["validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /expects exactly one argument/);
});

test("expands domain pack in dry-run mode", () => {
  const fixtureRoot = path.join("tests", "fixtures", "domain-packs");
  const result = runCli([
    "expand",
    "--pack-root",
    fixtureRoot,
    "--pack",
    "parking-management/backend",
    "--project-dir",
    "/private/tmp/smart-parking",
    "--var",
    "PROJECT_NAME=Smart Parking Backend",
    "--var",
    "PROJECT_SLUG=smart-parking",
    "--var",
    "DOMAIN=parking operations",
    "--dry-run",
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Using pack:/);
  assert.match(result.stdout, /\[dry-run\] write/);
  assert.match(result.stdout, /Generated 5 scenario file\(s\)/);
});

test("can init and validate a generated project end-to-end", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "csda-e2e-"));
  const slug = `spec-driven-${Date.now()}`;
  const configPath = path.join(tempRoot, "project.config");
  const projectDir = path.join(tempRoot, slug);

  const config = [
    'PROJECT_NAME="E2E Spec Driven"',
    `PROJECT_SLUG="${slug}"`,
    'PROJECT_TYPE="backend"',
    'DOMAIN="automation testing"',
    'STACK="Quarkus 3.x, Java 21, PostgreSQL, RESTEasy Reactive, SmallRye GraphQL, Maven"',
    'API_STYLE="REST and GraphQL with DTO boundaries"',
    'TESTING="Quarkus Test, Testcontainers, JUnit 5, Cucumber"',
    'LANG="en"',
    'MODULES="auth"',
  ].join("\n");

  fs.writeFileSync(configPath, `${config}\n`, "utf8");

  const initResult = runCli([
    "init",
    "--config",
    configPath,
    "--out",
    tempRoot,
    "--force",
    "--no-git",
  ]);

  assert.equal(initResult.status, 0);
  assert.ok(fs.existsSync(projectDir), "project directory should exist");

  const validateResult = runCli(["validate", projectDir]);
  assert.equal(validateResult.status, 0);
  assert.match(validateResult.stdout, /Validation passed/);

  const aiRules = fs.readFileSync(path.join(projectDir, "AI_RULES.md"), "utf8");
  assert.match(aiRules, /Stack: Quarkus 3\.x, Java 21, PostgreSQL/);
  assert.match(aiRules, /Do not infer or replace the stack/);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("can init, expand, and validate a generated project end-to-end", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "csda-expand-e2e-"));
  const slug = `parking-spec-driven-${Date.now()}`;
  const configPath = path.join(tempRoot, "project.config");
  const projectDir = path.join(tempRoot, slug);

  const config = [
    'PROJECT_NAME="Parking E2E"',
    `PROJECT_SLUG="${slug}"`,
    'PROJECT_TYPE="backend"',
    'DOMAIN="parking operations"',
    'STACK="Quarkus 3.x, Java 21, PostgreSQL, RESTEasy Reactive, SmallRye GraphQL, Maven"',
    'API_STYLE="REST and GraphQL with DTO boundaries"',
    'TESTING="Quarkus Test, Testcontainers, JUnit 5, Cucumber"',
    'LANG="en"',
    'MODULES=""',
  ].join("\n");

  fs.writeFileSync(configPath, `${config}\n`, "utf8");

  const initResult = runCli([
    "init",
    "--config",
    configPath,
    "--out",
    tempRoot,
    "--force",
    "--no-git",
  ]);

  assert.equal(initResult.status, 0);
  assert.ok(fs.existsSync(projectDir), "project directory should exist");

  const packRoot = path.join(ROOT_DIR, "tests", "fixtures", "domain-packs");
  const expandResult = runCli([
    "expand",
    "--pack-root",
    packRoot,
    "--pack",
    "parking-management/backend",
    "--project-dir",
    projectDir,
    "--var",
    "PROJECT_NAME=Parking E2E",
    "--var",
    `PROJECT_SLUG=${slug}`,
    "--var",
    "DOMAIN=parking operations",
  ]);

  assert.equal(expandResult.status, 0);
  assert.ok(
    fs.existsSync(path.join(projectDir, "features", "capacity", "capacity_threshold.feature"))
  );
  assert.ok(fs.existsSync(path.join(projectDir, "docs", "specs", "domain-model.md")));
  assert.ok(fs.existsSync(path.join(projectDir, "docs", "specs", "use-cases.md")));
  assert.ok(fs.existsSync(path.join(projectDir, "docs", "specs", "commands.md")));
  assert.ok(fs.existsSync(path.join(projectDir, "docs", "specs", "events.md")));
  assert.ok(fs.existsSync(path.join(projectDir, "docs", "specs", "aggregates.md")));

  const aiRules = fs.readFileSync(path.join(projectDir, "AI_RULES.md"), "utf8");
  assert.match(aiRules, /Stack: Quarkus 3\.x, Java 21, PostgreSQL/);
  assert.match(aiRules, /Testing: Quarkus Test, Testcontainers, JUnit 5, Cucumber/);
  assert.match(aiRules, /Do not infer or replace the stack/);

  const traceability = fs.readFileSync(
    path.join(projectDir, "docs", "specs", "traceability.md"),
    "utf8"
  );
  assert.match(
    traceability,
    /\| Requirement \| Scenario ID \| Feature file \| Use Case \| Command\/Query \| Aggregate \| Event \| Technical artifact \| Test artifact \| Status \|/
  );
  assert.match(traceability, /REQ-001/);
  assert.match(traceability, /SCN-001/);
  assert.match(traceability, /UC-001 Monitor Capacity Threshold/);
  assert.match(traceability, /CMD-001 CheckCapacityThresholdCommand/);
  assert.match(traceability, /AGG-001 ParkingFacility/);
  assert.match(traceability, /EVT-001 CapacityThresholdReached/);

  const domainModel = fs.readFileSync(
    path.join(projectDir, "docs", "specs", "domain-model.md"),
    "utf8"
  );
  assert.match(domainModel, /BC-001/);
  assert.match(domainModel, /Parking Operations/);
  assert.match(domainModel, /AGG-001/);

  const validateResult = runCli(["validate", projectDir]);
  assert.equal(validateResult.status, 0);
  assert.match(validateResult.stdout, /Validation passed/);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
