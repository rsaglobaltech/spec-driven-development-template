"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs, substituteAgentCommand } = require("../../scripts/harness/run");
const { buildPrompt } = require("../../scripts/harness/prompt");
const { readHarnessConfig, resolveHarnessSettings } = require("../../scripts/harness/config");

// ── parseArgs ────────────────────────────────────────────────────────────────

test("parseArgs has sane defaults", () => {
  const a = parseArgs([]);
  assert.equal(a.projectDir, ".");
  assert.equal(a.agent, "");
  assert.equal(a.maxAttempts, 0);
  assert.equal(a.timeout, 600);
  assert.equal(a.format, "text");
  assert.equal(a.dryRun, false);
  assert.deepEqual(a.reqs, []);
});

test("parseArgs reads agent, test-cmd, max-attempts and repeated --req", () => {
  const a = parseArgs([
    "--agent",
    "claude -p < {prompt_file}",
    "--test-cmd",
    "npm test",
    "--max-attempts",
    "5",
    "--req",
    "REQ-001",
    "--req",
    "REQ-002",
  ]);
  assert.equal(a.agent, "claude -p < {prompt_file}");
  assert.equal(a.testCmd, "npm test");
  assert.equal(a.maxAttempts, 5);
  assert.deepEqual(a.reqs, ["REQ-001", "REQ-002"]);
});

test("parseArgs rejects a non-positive --max-attempts", () => {
  assert.throws(() => parseArgs(["--max-attempts", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["--max-attempts", "x"]), /positive integer/);
});

test("parseArgs rejects a malformed --req", () => {
  assert.throws(() => parseArgs(["--req", "001"]), /REQ-NNN/);
});

test("parseArgs rejects an unknown flag and an invalid --format", () => {
  assert.throws(() => parseArgs(["--bogus"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--format", "yaml"]), /Invalid --format/);
});

// ── substituteAgentCommand ───────────────────────────────────────────────────

test("substituteAgentCommand replaces every {prompt_file} occurrence", () => {
  const cmd = substituteAgentCommand("cat {prompt_file} && run {prompt_file}", "/tmp/p.md");
  assert.equal(cmd, "cat /tmp/p.md && run /tmp/p.md");
});

test("substituteAgentCommand throws when the placeholder is missing", () => {
  assert.throws(() => substituteAgentCommand("claude -p", "/tmp/p.md"), /\{prompt_file\}/);
});

// ── buildPrompt ──────────────────────────────────────────────────────────────

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "harness-prompt-"));
}

const sampleReq = {
  requirement: "REQ-001",
  scenario_id: "SCN-001",
  feature_file: "features/capacity/threshold.feature",
  technical_artifact: "src/Capacity.java",
  test_artifact: "test/CapacityTest.java",
  status: "Draft",
  category: "NEEDS_TEST",
};

test("buildPrompt embeds the requirement facts and the definition of done", () => {
  const dir = tmpProject();
  try {
    const prompt = buildPrompt(sampleReq, dir);
    assert.match(prompt, /# Implement REQ-001/);
    assert.match(prompt, /Test artifact \(write this first — TDD\): test\/CapacityTest\.java/);
    assert.match(prompt, /Definition of done/);
    assert.match(prompt, /Do not edit `docs\/specs\/traceability\.md`/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildPrompt inlines the Gherkin feature file when it exists", () => {
  const dir = tmpProject();
  try {
    const featurePath = path.join(dir, "features", "capacity", "threshold.feature");
    fs.mkdirSync(path.dirname(featurePath), { recursive: true });
    fs.writeFileSync(featurePath, "Feature: Capacity\n  Scenario: over\n", "utf8");
    const prompt = buildPrompt(sampleReq, dir);
    assert.match(prompt, /```gherkin/);
    assert.match(prompt, /Feature: Capacity/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildPrompt notes a missing feature file instead of inlining it", () => {
  const dir = tmpProject();
  try {
    const prompt = buildPrompt(sampleReq, dir);
    assert.match(prompt, /does not exist yet/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildPrompt appends the previous failure on a retry", () => {
  const dir = tmpProject();
  try {
    const prompt = buildPrompt(sampleReq, dir, {
      previousFailure: "AssertionError: expected 200 got 500",
      attempt: 2,
      maxAttempts: 3,
    });
    assert.match(prompt, /Previous attempt failed \(attempt 1 of 3\)/);
    assert.match(prompt, /AssertionError: expected 200 got 500/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── config ───────────────────────────────────────────────────────────────────

test("readHarnessConfig returns null when no config file exists", () => {
  const dir = tmpProject();
  try {
    assert.equal(readHarnessConfig(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readHarnessConfig parses agent, test_cmd and max_attempts", () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(
      path.join(dir, "harness.config.yaml"),
      "harness_version: 1\nagent: claude -p < {prompt_file}\ntest_cmd: npm test\nmax_attempts: 4\n",
      "utf8"
    );
    const config = readHarnessConfig(dir);
    assert.equal(config.agent, "claude -p < {prompt_file}");
    assert.equal(config.testCmd, "npm test");
    assert.equal(config.maxAttempts, 4);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readHarnessConfig rejects a non-positive max_attempts", () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(path.join(dir, "harness.config.yaml"), "max_attempts: 0\n", "utf8");
    assert.throws(() => readHarnessConfig(dir), /max_attempts/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveHarnessSettings lets CLI flags override the file, file fills gaps", () => {
  const file = { agent: "file-agent {prompt_file}", testCmd: "file-test", maxAttempts: 9 };
  const merged = resolveHarnessSettings(file, {
    agent: "cli-agent {prompt_file}",
    testCmd: "",
    maxAttempts: 0,
  });
  assert.equal(merged.agent, "cli-agent {prompt_file}");
  assert.equal(merged.testCmd, "file-test");
  assert.equal(merged.maxAttempts, 9);
});

test("resolveHarnessSettings defaults maxAttempts to 3 with no file and no flag", () => {
  const merged = resolveHarnessSettings(null, { agent: "", testCmd: "", maxAttempts: 0 });
  assert.equal(merged.maxAttempts, 3);
  assert.equal(merged.agent, "");
});
