"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  substituteAgentCommand,
  substituteGateCommand,
} = require("../../scripts/harness/run");
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
    // Sourced from `change instructions apply`, so assert the substance rather
    // than the emphasis markers it happens to use.
    assert.match(prompt, /Do not edit `docs\/specs\/traceability\.md`/);
    assert.match(prompt, /Do not modify\*\* `spec\.md`, `AI_RULES\.md`/);
    assert.match(prompt, /csda plan` is the queue/);
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
  assert.equal(merged.promptPrefix, "");
});

// ── prompt_prefix / prompt_prefix_file ───────────────────────────────────────

test("readHarnessConfig reads an inline prompt_prefix", () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(
      path.join(dir, "harness.config.yaml"),
      'prompt_prefix: "Role: Lead Architect."\n',
      "utf8"
    );
    const config = readHarnessConfig(dir);
    assert.equal(config.promptPrefix, "Role: Lead Architect.");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readHarnessConfig loads a multi-line prompt_prefix_file", () => {
  const dir = tmpProject();
  try {
    fs.mkdirSync(path.join(dir, ".harness"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".harness", "prefix.md"),
      "Role: Lead Architect.\nHexagonal arch is non-negotiable.\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(dir, "harness.config.yaml"),
      "prompt_prefix_file: ./.harness/prefix.md\n",
      "utf8"
    );
    const config = readHarnessConfig(dir);
    assert.match(config.promptPrefix, /Lead Architect/);
    assert.match(config.promptPrefix, /Hexagonal/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readHarnessConfig errors when prompt_prefix_file is missing", () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(
      path.join(dir, "harness.config.yaml"),
      "prompt_prefix_file: ./does-not-exist.md\n",
      "utf8"
    );
    assert.throws(() => readHarnessConfig(dir), /prompt_prefix_file not found/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readHarnessConfig prefers prompt_prefix_file over inline when both set", () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(path.join(dir, "prefix.md"), "from-file", "utf8");
    fs.writeFileSync(
      path.join(dir, "harness.config.yaml"),
      'prompt_prefix: "inline"\nprompt_prefix_file: ./prefix.md\n',
      "utf8"
    );
    assert.equal(readHarnessConfig(dir).promptPrefix, "from-file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildPrompt prepends promptPrefix with a separator", () => {
  const dir = tmpProject();
  try {
    const prompt = buildPrompt(sampleReq, dir, {
      promptPrefix: "## Role\nLead Architect.\n",
    });
    // Prefix appears before the requirement header, separated by ---.
    const idxPrefix = prompt.indexOf("Lead Architect");
    const idxSep = prompt.indexOf("\n---\n");
    const idxReq = prompt.indexOf("# Implement REQ-001");
    assert.ok(idxPrefix >= 0 && idxSep > idxPrefix && idxReq > idxSep);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildPrompt omits the separator when promptPrefix is blank or absent", () => {
  const dir = tmpProject();
  try {
    const noPrefix = buildPrompt(sampleReq, dir);
    const blank = buildPrompt(sampleReq, dir, { promptPrefix: "   \n  " });
    assert.ok(!noPrefix.startsWith("---"));
    assert.ok(!blank.startsWith("---"));
    assert.equal(noPrefix, blank);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveHarnessSettings exposes promptPrefix from the file config", () => {
  const merged = resolveHarnessSettings(
    { promptPrefix: "## Role\nLead Architect.\n" },
    { agent: "", testCmd: "", maxAttempts: 0 }
  );
  assert.match(merged.promptPrefix, /Lead Architect/);
});

// ── The plan → prompt seam ───────────────────────────────────────────────────
//
// `run.ts` feeds `buildPrompt` by shelling out to `plan --format json` and
// parsing the result, so the two are coupled through a wire format. When that
// format was normalised to camelCase, `buildPrompt` kept reading snake_case
// and every generated prompt silently said "(none declared)" for the scenario,
// the feature file and both artefacts — a prompt an agent cannot act on.
//
// Nothing failed, because the fixture above was written in the old vocabulary
// and tested a shape `plan` no longer produces. These run the real seam.

const { spawnSync } = require("node:child_process");
const REPO_ROOT = path.resolve(__dirname, "../../..");
const CLI = path.join(REPO_ROOT, "bin", "create-spec-driven-app.js");

test("buildPrompt reads the camelCase field names the contract specifies", () => {
  const dir = tmpProject();
  try {
    const prompt = buildPrompt(
      {
        requirement: "REQ-042",
        scenarioId: "SCN-042",
        featureFile: "features/billing/invoice.feature",
        technicalArtifact: "src/domain/invoice.ts",
        testArtifact: "tests/unit/invoice.test.ts",
        status: "Draft",
        category: "NEEDS_TEST",
      },
      dir
    );
    assert.match(prompt, /Scenario ID: SCN-042/);
    assert.match(prompt, /Feature file: features\/billing\/invoice\.feature/);
    assert.match(prompt, /test artifact.*tests\/unit\/invoice\.test\.ts/i);
    assert.match(prompt, /Production artifact: src\/domain\/invoice\.ts/);
    assert.doesNotMatch(prompt, /\(none declared\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildPrompt still reads snake_case, so an older plan output is not blanked", () => {
  const dir = tmpProject();
  try {
    const prompt = buildPrompt(sampleReq, dir);
    assert.match(prompt, /Scenario ID: SCN-001/);
    assert.match(prompt, /Feature file: features\/capacity\/threshold\.feature/);
    assert.doesNotMatch(prompt, /\(none declared\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a requirement straight out of `plan --format json` produces a usable prompt", () => {
  // The end-to-end guard: scaffold a project, ask the real CLI for its plan,
  // and feed the first requirement to the real prompt builder. If the wire
  // format drifts again, this is what notices.
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "harness-seam-"));
  try {
    const init = spawnSync(process.execPath, [CLI, "init", "--yes", "--out", parent, "--no-git"], {
      encoding: "utf8",
    });
    assert.equal(init.status, 0, init.stdout + init.stderr);
    const projectDir = path.join(parent, fs.readdirSync(parent)[0]);

    const planned = spawnSync(
      process.execPath,
      [CLI, "plan", "--project-dir", projectDir, "--format", "json"],
      { encoding: "utf8" }
    );
    const plan = JSON.parse(planned.stdout);
    const req = (plan.requirements || [])[0];
    assert.ok(req, "plan returned no requirements to build a prompt from");

    const prompt = buildPrompt(req, projectDir);
    assert.match(prompt, new RegExp(`# Implement ${req.requirement}`));
    // The scaffolded requirement declares a scenario and a feature file, so a
    // prompt claiming none declared means the seam is broken, not that the
    // project is empty.
    assert.doesNotMatch(prompt, /Scenario ID: \(none\)/);
    assert.doesNotMatch(prompt, /Feature file: \(none declared\)/);
    assert.match(prompt, /```gherkin/);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

// ── Agent profiles ───────────────────────────────────────────────────────────
//
// `agent_profile` names an entry in .harness/profiles.yaml, so a team can
// commit the agent commands it uses and pick one by name rather than commit a
// single default somebody pays for by accident.
//
// It exists because the HIE pilot was already configured this way — the file
// declared `agent_profile: local-claude` and a matching profiles.yaml, the CLI
// read neither, and `harness run` reported "No agent configured" while the
// config plainly declared one.

function projectWithProfiles(config, profiles?) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-profiles-"));
  fs.writeFileSync(path.join(dir, "harness.config.yaml"), config, "utf8");
  if (profiles !== undefined) {
    fs.mkdirSync(path.join(dir, ".harness"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".harness", "profiles.yaml"), profiles, "utf8");
  }
  return dir;
}

test("agent_profile resolves to the profile's agent command", () => {
  const dir = projectWithProfiles(
    "harness_version: 1\nagent_profile: local-claude\n",
    'profiles_version: 1\nprofiles:\n  local-claude:\n    agent: "claude -p < {prompt_file}"\n'
  );
  try {
    assert.equal(readHarnessConfig(dir).agent, "claude -p < {prompt_file}");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an explicit agent wins over a profile", () => {
  // The narrower statement beats the indirection.
  const dir = projectWithProfiles(
    'harness_version: 1\nagent: "direct {prompt_file}"\nagent_profile: local-claude\n',
    'profiles_version: 1\nprofiles:\n  local-claude:\n    agent: "profile {prompt_file}"\n'
  );
  try {
    assert.equal(readHarnessConfig(dir).agent, "direct {prompt_file}");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a profile that does not exist names the ones that do", () => {
  const dir = projectWithProfiles(
    "harness_version: 1\nagent_profile: nope\n",
    'profiles_version: 1\nprofiles:\n  ci:\n    agent: "a {prompt_file}"\n  local:\n    agent: "b {prompt_file}"\n'
  );
  try {
    assert.throws(
      () => readHarnessConfig(dir),
      (err) => /no profile 'nope'/.test(err.message) && /ci, local/.test(err.message)
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent_profile without a profiles.yaml says so, and offers the alternative", () => {
  const dir = projectWithProfiles("harness_version: 1\nagent_profile: local\n");
  try {
    assert.throws(
      () => readHarnessConfig(dir),
      (err) => /profiles\.yaml/.test(err.message) && /agent:/.test(err.message)
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an unknown key is rejected rather than ignored", () => {
  // Silently ignoring one is how a pilot ends up configured against a feature
  // that does not exist.
  const dir = projectWithProfiles('harness_version: 1\nagnet: "typo {prompt_file}"\n');
  try {
    assert.throws(
      () => readHarnessConfig(dir),
      (err) => /unknown key\(s\): agnet/.test(err.message) && /Known keys:/.test(err.message)
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("every key `harness init` generates is a key the reader accepts", () => {
  // The two ends of the same contract: what the scaffolder writes must be what
  // the reader understands, or the strict check above turns into a trap.
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "harness-roundtrip-"));
  try {
    const init = spawnSync(process.execPath, [CLI, "init", "--yes", "--out", parent, "--no-git"], {
      encoding: "utf8",
    });
    assert.equal(init.status, 0, init.stdout + init.stderr);
    const projectDir = path.join(parent, fs.readdirSync(parent)[0]);
    const gen = spawnSync(process.execPath, [CLI, "harness", "init", "--project-dir", projectDir], {
      encoding: "utf8",
    });
    assert.equal(gen.status, 0, gen.stdout + gen.stderr);
    assert.doesNotThrow(() => readHarnessConfig(projectDir));
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

// ── The gate has to be able to run the scenario under test ───────────────────
//
// `test_cmd` was a fixed string, and the gate runs *before* `csda done`, so the
// requirement is still Draft and `validate --strict-tdd` does not demand its
// test either. Between the two, the loop could mark a requirement Implemented
// with its scenario never executed — the one outcome this tool exists to
// prevent. Substitution is what lets a project close that.

test("the gate command substitutes the requirement under test", () => {
  const cmd = substituteGateCommand(
    "npm run verify && npm run test:e2e -- {feature_file} --tags @{req} # {scenario}",
    {
      requirement: "REQ-007",
      scenarioId: "SCN-007",
      featureFile: "`features/billing/refund.feature`",
    }
  );
  // Backticks come from the matrix cell and are not part of the path.
  assert.match(cmd, /test:e2e -- features\/billing\/refund\.feature/);
  assert.match(cmd, /--tags @REQ-007/);
  assert.match(cmd, /# SCN-007/);
  assert.doesNotMatch(cmd, /`/);
});

test("the gate command accepts the matrix's snake_case spelling too", () => {
  // Same seam as buildPrompt: `plan --format json` used snake_case before the
  // contract was normalised, and a hand-piped older document should still work.
  const cmd = substituteGateCommand("run {feature_file} for {scenario}", {
    requirement: "REQ-001",
    scenario_id: "SCN-001",
    feature_file: "features/core/health.feature",
  });
  assert.equal(cmd, "run features/core/health.feature for SCN-001");
});

test("a gate command with no placeholders is passed through untouched", () => {
  assert.equal(substituteGateCommand("mvn -B test", { requirement: "REQ-002" }), "mvn -B test");
});

test("a missing feature file substitutes empty rather than the word undefined", () => {
  // `npm test -- undefined` would run, and fail for a reason that reads like a
  // bug in the project rather than a gap in its matrix.
  const cmd = substituteGateCommand("npm test -- {feature_file}", { requirement: "REQ-003" });
  assert.equal(cmd, "npm test -- ");
});

test("an anchor in the feature cell is dropped, since it is not a path", () => {
  const cmd = substituteGateCommand("run {feature_file}", {
    featureFile: "features/a/b.feature#L12",
  });
  assert.equal(cmd, "run features/a/b.feature");
});
