"use strict";
const { Given, When, Then, After } = require("@cucumber/cucumber");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BASE_CONFIG = `PROJECT_NAME="BDD Test Project"
PROJECT_SLUG="bdd-test-project"
PROJECT_TYPE="backend"
DOMAIN="testing"
STACK="Node.js 20"
API_STYLE="REST"
TESTING="Jest"
DOCKER_SUPPORT="false"
DEVCONTAINER_SUPPORT="false"
`;

After(function () {
  this.cleanup();
});

// ── Given ─────────────────────────────────────────────────────────────────────

Given("a valid project config file", function () {
  this.writeConfig(BASE_CONFIG);
});

Given("a config file missing {string}", function (key) {
  const cfg = BASE_CONFIG.split("\n")
    .filter((l) => !l.startsWith(key))
    .join("\n");
  this.writeConfig(cfg);
});

Given("a config file with {string} set to {string}", function (key, value) {
  const cfg = BASE_CONFIG
    .split("\n")
    .filter((l) => !l.startsWith(key))
    .concat([`${key}="${value}"`])
    .join("\n");
  this.writeConfig(cfg);
});

Given("a project generated with valid config", function () {
  this.writeConfig(BASE_CONFIG);
  this.runInit();
});

Given("a project directory missing {string}", function (file) {
  this.writeConfig(BASE_CONFIG);
  this.runInit();
  const target = path.join(this.projectDir, file);
  if (fs.existsSync(target)) fs.rmSync(target);
});

Given("a project with {string} in a spec file", function (placeholder) {
  this.writeConfig(BASE_CONFIG);
  this.runInit();
  const specFile = path.join(this.projectDir, "spec.md");
  const content = fs.readFileSync(specFile, "utf8");
  fs.writeFileSync(specFile, content + `\n${placeholder}\n`);
});

Given("an existing generated project", function () {
  this.writeConfig(BASE_CONFIG);
  this.runInit();
});

Given("the parking-management domain pack", function () {
  this.packRoot = path.resolve("tests/fixtures/domain-packs");
  this.packId = "parking-management/backend";
});

// ── When ──────────────────────────────────────────────────────────────────────

When("I run {string} with the config file", function (cmd) {
  if (cmd === "init") {
    this.lastResult = this.runInit();
  }
});

When("I run {string} with {string}", function (cmd, flag) {
  if (cmd === "init" && flag === "--dry-run") {
    this.lastResult = this.runInit(["--dry-run"]);
  } else if (cmd === "expand" && flag === "--dry-run") {
    // Snapshot existing feature files before dry-run so we can assert none are added
    const featuresDir = path.join(this.projectDir, "features");
    this.featureFilesBeforeExpand = fs.existsSync(featuresDir)
      ? fs.readdirSync(featuresDir, { recursive: true }).filter((f) => f.endsWith(".feature"))
      : [];
    this.lastResult = this.run([
      "expand",
      "--pack-root", this.packRoot,
      "--pack", this.packId,
      "--project-dir", this.projectDir,
      "--var", "PROJECT_NAME=BDD Test",
      "--var", "PROJECT_SLUG=bdd-test",
      "--var", "DOMAIN=testing",
      "--dry-run",
    ]);
  }
});

When("I run {string} with no arguments", function (cmd) {
  this.lastResult = this.run([cmd]);
});

When("I run {string} with the incomplete config", function (_cmd) {
  this.lastResult = this.runInit();
});

When("I run an unknown command {string}", function (cmd) {
  this.lastResult = this.run([cmd]);
});

When("I run {string} on that project", function (cmd) {
  this.lastResult = this.run([cmd, this.projectDir]);
});

When("I run {string} on the project", function (cmd) {
  this.lastResult = this.run([
    cmd,
    "--pack-root", this.packRoot,
    "--pack", this.packId,
    "--project-dir", this.projectDir,
    "--var", `PROJECT_NAME=BDD Test Project`,
    "--var", "PROJECT_SLUG=bdd-test-project",
    "--var", "DOMAIN=testing",
  ]);
});

When("I run {string} without {string}", function (cmd, flag) {
  if (cmd === "expand" && flag.includes("pack-root")) {
    this.lastResult = this.run(["expand", "--pack", "parking-management/backend"]);
  } else if (cmd === "expand" && flag.includes("PROJECT_NAME")) {
    this.lastResult = this.run([
      "expand",
      "--pack-root", this.packRoot,
      "--pack", this.packId,
      "--project-dir", this.projectDir,
    ]);
  }
});

When("I run {string} without providing {string}", function (cmd, _varName) {
  if (cmd === "expand") {
    const args = [
      "expand",
      "--pack-root", this.packRoot,
      "--pack", this.packId,
      "--project-dir", this.projectDir,
    ];
    this.lastResult = this.run(args);
  }
});

// ── Then ──────────────────────────────────────────────────────────────────────

Then("the command exits with code {int}", function (code) {
  const result = this.lastResult || this.result;
  assert.equal(result.status, code, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
});

Then("the command exits with a non-zero code", function () {
  const result = this.lastResult || this.result;
  assert.notEqual(result.status, 0, `Expected non-zero exit. stdout: ${result.stdout}`);
});

Then("the output directory contains {string}", function (file) {
  const target = path.join(this.projectDir, file);
  assert.ok(fs.existsSync(target), `Expected file not found: ${target}`);
});

Then("the output directory does not contain {string}", function (file) {
  const target = path.join(this.projectDir, file);
  assert.ok(!fs.existsSync(target), `File should not exist: ${target}`);
});

Then("no files are written to the output directory", function () {
  assert.ok(
    !fs.existsSync(this.projectDir),
    `Project dir should not exist after dry-run: ${this.projectDir}`
  );
});

Then("no feature files are written", function () {
  const featuresDir = path.join(this.projectDir, "features");
  if (!fs.existsSync(featuresDir)) return;
  const current = fs.readdirSync(featuresDir, { recursive: true }).filter((f) => f.endsWith(".feature"));
  const before = this.featureFilesBeforeExpand || [];
  const added = current.filter((f) => !before.includes(f));
  assert.equal(added.length, 0, `New .feature files written in dry-run: ${added.join(", ")}`);
});

Then("stderr contains {string}", function (text) {
  const result = this.lastResult || this.result;
  const combined = (result.stderr || "") + (result.stdout || "");
  assert.ok(
    combined.toLowerCase().includes(text.toLowerCase()),
    `Expected "${text}" in output.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
  );
});

Then("stdout contains {string} or {string} or {string}", function (a, b, c) {
  const result = this.lastResult || this.result;
  const out = (result.stdout || "").toLowerCase();
  assert.ok(
    out.includes(a.toLowerCase()) || out.includes(b.toLowerCase()) || out.includes(c.toLowerCase()),
    `Expected one of "${a}", "${b}", "${c}" in stdout.\nstdout: ${result.stdout}`
  );
});

Then("stderr contains {string} or {string}", function (a, b) {
  const result = this.lastResult || this.result;
  const combined = ((result.stderr || "") + (result.stdout || "")).toLowerCase();
  assert.ok(
    combined.includes(a.toLowerCase()) || combined.includes(b.toLowerCase()),
    `Expected "${a}" or "${b}" in output.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
  );
});

Then("the project passes {string}", function (cmd) {
  const result = this.run([cmd, this.projectDir]);
  assert.equal(result.status, 0, `validate failed:\n${result.stdout}\n${result.stderr}`);
});
