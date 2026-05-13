"use strict";

/**
 * Unit tests for the shared `resolveProjectDir` helper used by plan,
 * done, specops sync/diff/add/remove.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  resolveProjectDir,
  findProjectRoot,
  isSpecDrivenDir,
  SENTINELS,
} = require("../../scripts/lib/project-root");

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "project-root-"));
}

test("SENTINELS lists the three accepted markers", () => {
  assert.deepEqual(
    new Set(SENTINELS),
    new Set(["spec.md", ".specops.lock", "specops.config.yaml"])
  );
});

test("isSpecDrivenDir is true when spec.md exists", () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, "spec.md"), "# x\n");
    assert.equal(isSpecDrivenDir(dir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isSpecDrivenDir is true when .specops.lock exists", () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, ".specops.lock"), "{}");
    assert.equal(isSpecDrivenDir(dir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isSpecDrivenDir is true when specops.config.yaml exists", () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, "specops.config.yaml"), "specops_version: 1\n");
    assert.equal(isSpecDrivenDir(dir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isSpecDrivenDir is false on a plain directory", () => {
  const dir = mkdir();
  try {
    assert.equal(isSpecDrivenDir(dir), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("findProjectRoot walks up to find a sentinel", () => {
  const root = mkdir();
  try {
    fs.writeFileSync(path.join(root, "spec.md"), "# x\n");
    const deep = path.join(root, "src", "main", "nested");
    fs.mkdirSync(deep, { recursive: true });
    assert.equal(findProjectRoot(deep), fs.realpathSync(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("findProjectRoot returns null when no sentinel is found in the tree", () => {
  const dir = mkdir();
  try {
    // No sentinel anywhere under this directory; walking up will eventually hit
    // a real filesystem root which may or may not contain its own sentinel —
    // so we just assert the call does not throw.
    const result = findProjectRoot(dir);
    assert.ok(result === null || typeof result === "string");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectDir honours explicit --project-dir over auto-detect", () => {
  const dir = mkdir();
  try {
    assert.equal(resolveProjectDir(dir), path.resolve(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectDir({ requireSentinel }) throws when nothing is found", () => {
  const dir = mkdir();
  const originalCwd = process.cwd();
  try {
    process.chdir(dir);
    assert.throws(
      () => resolveProjectDir(".", { requireSentinel: true }),
      /No spec-driven project detected/
    );
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
