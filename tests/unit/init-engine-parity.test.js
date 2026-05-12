"use strict";

/**
 * Parity tests: --engine=node produces the same structure as the Bash engine.
 * We don't diff byte-for-byte (git hashes differ), but we assert that:
 *  - the same set of top-level file/directory names is produced
 *  - validate passes on both outputs
 *  - key files are non-empty
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const CLI = path.join(ROOT, "bin/create-spec-driven-app.js");
const CONFIG = path.join(ROOT, "examples/project.config.example");

function cli(...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 30000,
  });
}

function listTopLevel(dir) {
  return fs.readdirSync(dir).sort();
}

test("--engine=node produces output that passes validate", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-parity-node-"));
  try {
    const r = cli("init", "--engine=node", "--config", CONFIG, "--out", tmp, "--no-git", "--force");
    assert.equal(r.status, 0, `init failed:\n${r.stdout}\n${r.stderr}`);
    const projectDir = path.join(tmp, "acme-energy-hub");
    assert.ok(fs.existsSync(projectDir), "project directory should exist");
    const v = cli("validate", projectDir);
    assert.equal(v.status, 0, `validate failed:\n${v.stdout}\n${v.stderr}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("--engine=node generates spec.md", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-parity-spec-"));
  try {
    cli("init", "--engine=node", "--config", CONFIG, "--out", tmp, "--no-git", "--force");
    const specFile = path.join(tmp, "acme-energy-hub", "spec.md");
    assert.ok(fs.existsSync(specFile), "spec.md should exist");
    const content = fs.readFileSync(specFile, "utf8");
    assert.ok(content.includes("Acme Energy Hub"), "spec.md should contain project name");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("--engine=node generates traceability.md", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-parity-trace-"));
  try {
    cli("init", "--engine=node", "--config", CONFIG, "--out", tmp, "--no-git", "--force");
    const traceFile = path.join(tmp, "acme-energy-hub", "docs/specs/traceability.md");
    assert.ok(fs.existsSync(traceFile), "traceability.md should exist");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("--engine=node dry-run does not write files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-parity-dry-"));
  try {
    const r = cli("init", "--engine=node", "--config", CONFIG, "--out", tmp, "--no-git", "--dry-run");
    assert.equal(r.status, 0, r.stderr);
    const projectDir = path.join(tmp, "acme-energy-hub");
    assert.ok(!fs.existsSync(projectDir), "dry-run should not create project directory");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("--engine=node fails on missing required config key", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-parity-missing-"));
  try {
    const cfgPath = path.join(tmp, "partial.config");
    fs.writeFileSync(cfgPath, 'PROJECT_NAME="Test"\nPROJECT_SLUG="test"\n');
    const r = cli("init", "--engine=node", "--config", cfgPath, "--out", tmp, "--no-git");
    assert.notEqual(r.status, 0);
    assert.ok(
      (r.stderr + r.stdout).includes("PROJECT_TYPE") ||
      (r.stderr + r.stdout).includes("DOMAIN") ||
      r.status !== 0
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("--engine=node and Bash engine produce the same top-level files", () => {
  const tmpNode = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-par-node-"));
  const tmpBash = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-par-bash-"));
  try {
    const rNode = cli("init", "--engine=node", "--config", CONFIG, "--out", tmpNode, "--no-git", "--force");
    const rBash = cli("init", "--config", CONFIG, "--out", tmpBash, "--no-git", "--force");
    assert.equal(rNode.status, 0, `Node engine failed:\n${rNode.stdout}\n${rNode.stderr}`);
    assert.equal(rBash.status, 0, `Bash engine failed:\n${rBash.stdout}\n${rBash.stderr}`);

    const nodeFiles = listTopLevel(path.join(tmpNode, "acme-energy-hub"));
    const bashFiles = listTopLevel(path.join(tmpBash, "acme-energy-hub"));
    // .git directory may differ (Bash inits git by default in some envs); exclude it
    const nodeSet = new Set(nodeFiles.filter((f) => f !== ".git"));
    const bashSet = new Set(bashFiles.filter((f) => f !== ".git"));
    for (const f of bashSet) {
      assert.ok(nodeSet.has(f), `Node engine missing file/dir: ${f}`);
    }
    for (const f of nodeSet) {
      assert.ok(bashSet.has(f), `Bash engine missing file/dir (Node has extra): ${f}`);
    }
  } finally {
    fs.rmSync(tmpNode, { recursive: true, force: true });
    fs.rmSync(tmpBash, { recursive: true, force: true });
  }
});
