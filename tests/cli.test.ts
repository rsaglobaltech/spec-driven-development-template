const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
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
  assert.match(result.stdout, /\bUSAGE\b/i);
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
  assert.match(result.stderr, /expects exactly one positional argument/);
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
