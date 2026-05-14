"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs, diffDirs, walkFiles, buildExpandArgs } = require("../../scripts/specops/diff");

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "specops-diff-unit-"));
}

// ── parseArgs ────────────────────────────────────────────────────────────────

test("parseArgs defaults projectDir to '.' and pack/version to empty", () => {
  const args = parseArgs([]);
  assert.equal(args.projectDir, ".");
  assert.equal(args.pack, "");
  assert.equal(args.packVersion, "");
});

test("parseArgs accepts the documented flags", () => {
  const args = parseArgs([
    "--project-dir",
    "./p",
    "--pack",
    "backend",
    "--pack-version",
    "v2.0.0",
    "--cache-dir",
    "/tmp/c",
  ]);
  assert.equal(args.projectDir, "./p");
  assert.equal(args.pack, "backend");
  assert.equal(args.packVersion, "v2.0.0");
  assert.equal(args.cacheDir, "/tmp/c");
});

test("parseArgs throws on unknown flag", () => {
  assert.throws(() => parseArgs(["--bogus"]), /Unknown argument/);
});

test("parseArgs collects repeated --var into a vars map", () => {
  const args = parseArgs(["--var", "STACK=Node 20", "--var", "EXTRA=on"]);
  assert.deepEqual(args.vars, { STACK: "Node 20", EXTRA: "on" });
});

test("parseArgs rejects a malformed --var", () => {
  assert.throws(() => parseArgs(["--var", "NOEQUALS"]), /KEY=VALUE/);
});

test("buildExpandArgs lets --var extend and override the lockfile vars", () => {
  const entry = { repo: "r", pack_id: "backend", version: "v1", vars: { PROJECT_NAME: "Old" } };
  const out = buildExpandArgs(entry, "v2", "/tmp/x", "", { PROJECT_NAME: "New", STACK: "Node" });
  assert.ok(out.includes("PROJECT_NAME=New"));
  assert.ok(!out.includes("PROJECT_NAME=Old"));
  assert.ok(out.includes("STACK=Node"));
});

// ── walkFiles ────────────────────────────────────────────────────────────────

test("walkFiles returns POSIX-relative paths from a directory tree", () => {
  const root = mkdir();
  try {
    fs.mkdirSync(path.join(root, "a", "b"), { recursive: true });
    fs.writeFileSync(path.join(root, "x.txt"), "x");
    fs.writeFileSync(path.join(root, "a", "y.txt"), "y");
    fs.writeFileSync(path.join(root, "a", "b", "z.txt"), "z");
    const files = walkFiles(root).sort();
    assert.deepEqual(files, ["a/b/z.txt", "a/y.txt", "x.txt"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("walkFiles skips .git, node_modules, and .specops.lock", () => {
  const root = mkdir();
  try {
    fs.mkdirSync(path.join(root, ".git"));
    fs.writeFileSync(path.join(root, ".git", "HEAD"), "ref");
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.writeFileSync(path.join(root, "node_modules", "x.txt"), "x");
    fs.writeFileSync(path.join(root, ".specops.lock"), "{}");
    fs.writeFileSync(path.join(root, "real.txt"), "r");
    const files = walkFiles(root);
    assert.deepEqual(files, ["real.txt"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("walkFiles returns [] for a missing directory", () => {
  assert.deepEqual(walkFiles("/no/such/dir"), []);
});

// ── diffDirs ─────────────────────────────────────────────────────────────────

test("diffDirs classifies added, modified, and unchanged files", () => {
  const base = mkdir();
  const cand = mkdir();
  try {
    fs.writeFileSync(path.join(base, "same.txt"), "hello");
    fs.writeFileSync(path.join(cand, "same.txt"), "hello");

    fs.writeFileSync(path.join(base, "changed.txt"), "old");
    fs.writeFileSync(path.join(cand, "changed.txt"), "new");

    fs.writeFileSync(path.join(cand, "new.txt"), "fresh");

    const changes = diffDirs(base, cand);
    assert.deepEqual(changes.unchanged, ["same.txt"]);
    assert.deepEqual(changes.modified, ["changed.txt"]);
    assert.deepEqual(changes.added, ["new.txt"]);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(cand, { recursive: true, force: true });
  }
});

test("diffDirs treats every candidate file as added when baseline is empty", () => {
  const base = mkdir();
  const cand = mkdir();
  try {
    fs.writeFileSync(path.join(cand, "a.txt"), "a");
    fs.writeFileSync(path.join(cand, "b.txt"), "b");
    const changes = diffDirs(base, cand);
    assert.deepEqual(changes.added.sort(), ["a.txt", "b.txt"]);
    assert.deepEqual(changes.modified, []);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(cand, { recursive: true, force: true });
  }
});

test("diffDirs does not flag files that exist only in the baseline", () => {
  const base = mkdir();
  const cand = mkdir();
  try {
    fs.writeFileSync(path.join(base, "manual.txt"), "user-content");
    const changes = diffDirs(base, cand);
    assert.deepEqual(changes.added, []);
    assert.deepEqual(changes.modified, []);
    assert.deepEqual(changes.unchanged, []);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(cand, { recursive: true, force: true });
  }
});

// ── buildExpandArgs ──────────────────────────────────────────────────────────

test("buildExpandArgs targets the temp dir and includes lockfile vars", () => {
  const entry = {
    repo: "r",
    pack_id: "backend",
    version: "v1.0.0",
    vars: { PROJECT_NAME: "App" },
  };
  const args = buildExpandArgs(entry, "v1.0.0", "/tmp/d", "");
  assert.ok(args.includes("/tmp/d"));
  assert.ok(args.includes("PROJECT_NAME=App"));
  assert.equal(args.includes("--dry-run"), false);
});
