"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = require("node:path").resolve(__dirname.split("/tests")[0].replace(/\/dist$/, ""));
const CLI_PATH = path.join(ROOT_DIR, "bin", "create-spec-driven-app.js");
const PKG = require(path.join(ROOT_DIR, "package.json"));

function cli(...args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
}

function withTmp(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "csda-ci-"));
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const CASES = [
  { provider: "github", dest: ".github/workflows/spec-gate.yml", marker: "actions/checkout@v4" },
  { provider: "gitlab", dest: ".gitlab-ci.yml", marker: "spec-gate:" },
  { provider: "azure", dest: "azure-pipelines.yml", marker: "vmImage: ubuntu-latest" },
  { provider: "jenkins", dest: "Jenkinsfile", marker: "pipeline {" },
];

for (const { provider, dest, marker } of CASES) {
  test(`ci init --provider ${provider} writes ${dest} with the strict-tdd gate`, () => {
    withTmp((tmp) => {
      const r = cli("ci", "init", "--provider", provider, "--project-dir", tmp);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      const file = path.join(tmp, dest);
      assert.ok(fs.existsSync(file), `missing ${dest}`);
      const content = fs.readFileSync(file, "utf8");
      assert.ok(content.includes(marker), `missing marker '${marker}'`);
      assert.match(content, /validate \. --strict-tdd/);
      assert.match(content, /plan --project-dir \. --format json/);
      // The pack-drift gate, guarded so a project without packs is unaffected.
      assert.match(content, /validate \. --against-lock/);
      assert.match(content, /\.specops\.lock/);
      // Version is pinned, not 'latest', for reproducible CI.
      assert.ok(content.includes(`specgate@${PKG.version}`));
      // No unresolved template tokens.
      assert.ok(!/\{\{[A-Z_]+\}\}/.test(content));
    });
  });
}

test("ci init refuses to overwrite an existing config and points to --stdout", () => {
  withTmp((tmp) => {
    fs.writeFileSync(path.join(tmp, ".gitlab-ci.yml"), "existing: config\n", "utf8");
    const r = cli("ci", "init", "--provider", "gitlab", "--project-dir", tmp);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /refusing to overwrite/);
    assert.match(r.stderr, /--stdout/);
    assert.equal(fs.readFileSync(path.join(tmp, ".gitlab-ci.yml"), "utf8"), "existing: config\n");
  });
});

test("ci init --stdout prints the config without touching disk", () => {
  withTmp((tmp) => {
    const r = cli("ci", "init", "--provider", "jenkins", "--project-dir", tmp, "--stdout");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /pipeline \{/);
    assert.ok(!fs.existsSync(path.join(tmp, "Jenkinsfile")));
  });
});

test("ci init rejects an unknown provider with the supported list", () => {
  const r = cli("ci", "init", "--provider", "bamboo");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown provider: bamboo/);
  assert.match(r.stderr, /github, gitlab, azure, jenkins/);
});

test("ci without init subcommand fails clearly", () => {
  const r = cli("ci");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown ci sub-command: \(none\)\. Expected: init/);
});
