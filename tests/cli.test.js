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

// ── SpecOps: expand --pack-repo + .specops.lock ──────────────────────────────

function gitInTest(args, opts = {}) {
  const result = spawnSync("git", args, { encoding: "utf8", ...opts });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

function hasGit() {
  return spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;
}

test(
  "expand --pack-repo clones a remote pack and writes .specops.lock",
  { skip: !hasGit() },
  () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "csda-specops-e2e-"));
    const remoteRepo = path.join(tempRoot, "remote-pack");
    const cacheDir = path.join(tempRoot, "cache");
    const projectDir = path.join(tempRoot, "project");

    // Build a self-contained pack repo with the fixture pack already validated by the suite.
    fs.mkdirSync(remoteRepo, { recursive: true });
    fs.cpSync(
      path.join(ROOT_DIR, "tests", "fixtures", "domain-packs", "parking-management"),
      path.join(remoteRepo, "parking-management"),
      { recursive: true }
    );
    gitInTest(["init", "--quiet", "--initial-branch=main", remoteRepo]);
    gitInTest(["config", "user.email", "test@example.com"], { cwd: remoteRepo });
    gitInTest(["config", "user.name", "Test"], { cwd: remoteRepo });
    gitInTest(["config", "commit.gpgsign", "false"], { cwd: remoteRepo });
    gitInTest(["config", "tag.gpgsign", "false"], { cwd: remoteRepo });
    gitInTest(["add", "."], { cwd: remoteRepo });
    gitInTest(["commit", "--quiet", "-m", "initial"], { cwd: remoteRepo });
    gitInTest(["tag", "v0.1.0"], { cwd: remoteRepo });

    fs.mkdirSync(projectDir, { recursive: true });
    const result = runCli([
      "expand",
      "--pack-repo",
      remoteRepo,
      "--pack-version",
      "v0.1.0",
      "--pack",
      "parking-management/backend",
      "--project-dir",
      projectDir,
      "--cache-dir",
      cacheDir,
      "--var",
      "PROJECT_NAME=Smart Parking",
      "--var",
      "PROJECT_SLUG=smart-parking",
      "--var",
      "DOMAIN=parking operations",
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Resolving remote pack/);
    assert.match(result.stdout, /Cloned pack at/);

    // The expand should have produced the standard outputs in the project.
    assert.ok(fs.existsSync(path.join(projectDir, "AI_RULES.md")));
    assert.ok(
      fs.existsSync(path.join(projectDir, "features", "capacity", "capacity_threshold.feature"))
    );

    // .specops.lock should exist with one pack entry pointing at the right repo/version.
    const lockPath = path.join(projectDir, ".specops.lock");
    assert.ok(fs.existsSync(lockPath), ".specops.lock should be written");
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    assert.equal(lock.specops_version, 1);
    assert.equal(lock.packs.length, 1);
    assert.equal(lock.packs[0].pack_id, "parking-management/backend");
    assert.equal(lock.packs[0].version, "v0.1.0");
    assert.match(lock.packs[0].commit, /^[0-9a-f]{40}$/);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
);

test(
  "expand --pack-repo without --pack-version exits with a clear error",
  { skip: !hasGit() },
  () => {
    const result = runCli([
      "expand",
      "--pack-repo",
      "https://example.com/x.git",
      "--pack",
      "backend",
      "--project-dir",
      "/tmp/never-written",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--pack-version/);
  }
);

test("expand rejects --pack-root and --pack-repo together", () => {
  const result = runCli([
    "expand",
    "--pack-root",
    "./packs",
    "--pack-repo",
    "https://example.com/x.git",
    "--pack-version",
    "v1.0.0",
    "--pack",
    "backend",
    "--project-dir",
    "/tmp/never-written",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /either --pack-root or --pack-repo/);
});

// ── SpecOps sync + diff (M2) ─────────────────────────────────────────────────

function makeFixtureRemoteRepo(tempRoot) {
  const remoteRepo = path.join(tempRoot, "remote-pack");
  fs.mkdirSync(remoteRepo, { recursive: true });
  fs.cpSync(
    path.join(ROOT_DIR, "tests", "fixtures", "domain-packs", "parking-management"),
    path.join(remoteRepo, "parking-management"),
    { recursive: true }
  );
  gitInTest(["init", "--quiet", "--initial-branch=main", remoteRepo]);
  gitInTest(["config", "user.email", "test@example.com"], { cwd: remoteRepo });
  gitInTest(["config", "user.name", "Test"], { cwd: remoteRepo });
  gitInTest(["config", "commit.gpgsign", "false"], { cwd: remoteRepo });
  gitInTest(["config", "tag.gpgsign", "false"], { cwd: remoteRepo });
  gitInTest(["add", "."], { cwd: remoteRepo });
  gitInTest(["commit", "--quiet", "-m", "initial"], { cwd: remoteRepo });
  gitInTest(["tag", "v0.1.0"], { cwd: remoteRepo });
  return remoteRepo;
}

test("expand --pack-repo persists vars in .specops.lock", { skip: !hasGit() }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "csda-specops-vars-"));
  const remoteRepo = makeFixtureRemoteRepo(tempRoot);
  const projectDir = path.join(tempRoot, "project");
  fs.mkdirSync(projectDir, { recursive: true });

  const result = runCli([
    "expand",
    "--pack-repo",
    remoteRepo,
    "--pack-version",
    "v0.1.0",
    "--pack",
    "parking-management/backend",
    "--project-dir",
    projectDir,
    "--cache-dir",
    path.join(tempRoot, "cache"),
    "--var",
    "PROJECT_NAME=Smart Parking",
    "--var",
    "PROJECT_SLUG=smart-parking",
    "--var",
    "DOMAIN=parking operations",
  ]);
  assert.equal(result.status, 0, result.stderr);

  const lock = JSON.parse(fs.readFileSync(path.join(projectDir, ".specops.lock"), "utf8"));
  assert.ok(lock.packs[0].vars, "lockfile entry should record vars");
  assert.equal(lock.packs[0].vars.PROJECT_NAME, "Smart Parking");
  assert.equal(lock.packs[0].vars.PROJECT_SLUG, "smart-parking");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("specops sync re-expands packs recorded in the lockfile", { skip: !hasGit() }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "csda-specops-sync-"));
  const remoteRepo = makeFixtureRemoteRepo(tempRoot);
  const cacheDir = path.join(tempRoot, "cache");
  const projectDir = path.join(tempRoot, "project");
  fs.mkdirSync(projectDir, { recursive: true });

  // Initial expand → writes lockfile + generated files
  const initial = runCli([
    "expand",
    "--pack-repo",
    remoteRepo,
    "--pack-version",
    "v0.1.0",
    "--pack",
    "parking-management/backend",
    "--project-dir",
    projectDir,
    "--cache-dir",
    cacheDir,
    "--var",
    "PROJECT_NAME=Smart Parking",
    "--var",
    "PROJECT_SLUG=smart-parking",
    "--var",
    "DOMAIN=parking operations",
  ]);
  assert.equal(initial.status, 0, initial.stderr);

  // Delete a generated file so we can prove sync recreates it.
  const featurePath = path.join(projectDir, "features", "capacity", "capacity_threshold.feature");
  assert.ok(fs.existsSync(featurePath));
  fs.unlinkSync(featurePath);

  const syncResult = runCli([
    "specops",
    "sync",
    "--project-dir",
    projectDir,
    "--cache-dir",
    cacheDir,
  ]);
  assert.equal(syncResult.status, 0, syncResult.stderr);
  assert.match(syncResult.stdout, /Syncing parking-management\/backend @ v0\.1\.0/);
  assert.match(syncResult.stdout, /Sync completed for 1 pack\(s\)/);
  assert.ok(fs.existsSync(featurePath), "sync should regenerate the deleted feature file");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("specops diff shows no changes when project is in sync", { skip: !hasGit() }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "csda-specops-diff-clean-"));
  const remoteRepo = makeFixtureRemoteRepo(tempRoot);
  const cacheDir = path.join(tempRoot, "cache");
  const projectDir = path.join(tempRoot, "project");
  fs.mkdirSync(projectDir, { recursive: true });

  const initial = runCli([
    "expand",
    "--pack-repo",
    remoteRepo,
    "--pack-version",
    "v0.1.0",
    "--pack",
    "parking-management/backend",
    "--project-dir",
    projectDir,
    "--cache-dir",
    cacheDir,
    "--var",
    "PROJECT_NAME=Smart Parking",
    "--var",
    "PROJECT_SLUG=smart-parking",
    "--var",
    "DOMAIN=parking operations",
  ]);
  assert.equal(initial.status, 0, initial.stderr);

  const diff = runCli(["specops", "diff", "--project-dir", projectDir, "--cache-dir", cacheDir]);
  assert.equal(diff.status, 0, diff.stderr);
  assert.match(diff.stdout, /\(no changes\)/);
  assert.match(diff.stdout, /Diff completed for 1 pack/);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("specops diff reports added files after a manual deletion", { skip: !hasGit() }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "csda-specops-diff-modified-"));
  const remoteRepo = makeFixtureRemoteRepo(tempRoot);
  const cacheDir = path.join(tempRoot, "cache");
  const projectDir = path.join(tempRoot, "project");
  fs.mkdirSync(projectDir, { recursive: true });

  const initial = runCli([
    "expand",
    "--pack-repo",
    remoteRepo,
    "--pack-version",
    "v0.1.0",
    "--pack",
    "parking-management/backend",
    "--project-dir",
    projectDir,
    "--cache-dir",
    cacheDir,
    "--var",
    "PROJECT_NAME=Smart Parking",
    "--var",
    "PROJECT_SLUG=smart-parking",
    "--var",
    "DOMAIN=parking operations",
  ]);
  assert.equal(initial.status, 0, initial.stderr);

  // Remove a generated file — diff should now report it as "added" relative to the project.
  const featurePath = path.join(projectDir, "features", "capacity", "capacity_threshold.feature");
  fs.unlinkSync(featurePath);

  const diff = runCli(["specops", "diff", "--project-dir", projectDir, "--cache-dir", cacheDir]);
  assert.equal(diff.status, 0, diff.stderr);
  assert.match(diff.stdout, /\+ features\/capacity\/capacity_threshold\.feature/);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("specops sync errors when .specops.lock is missing", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "csda-specops-nolock-"));
  fs.mkdirSync(tempRoot, { recursive: true });
  const result = runCli(["specops", "sync", "--project-dir", tempRoot]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No .specops.lock found/);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("specops with unknown sub-command exits non-zero", () => {
  const result = runCli(["specops", "bogus"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown specops sub-command/);
});
