"use strict";

/**
 * Snapshot / determinism tests for generated project output.
 *
 * Strategy: generate the project twice from the same config and assert
 * that the set of files produced, and the rendered content of key files,
 * is identical between runs (and matches a committed golden snapshot).
 *
 * Golden snapshots live in tests/snapshot/golden/. When output intentionally
 * changes, update them with:
 *   UPDATE_SNAPSHOTS=1 node --test tests/snapshot/init-determinism.test.js
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
const GOLDEN_DIR = path.join(__dirname, "golden");
const UPDATE = process.env.UPDATE_SNAPSHOTS === "1";

function cli(...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 30_000,
  });
}

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full));
    else results.push(path.relative(dir, full));
  }
  return results.sort();
}

function generateProject(outDir) {
  const r = cli("init", "--config", CONFIG, "--out", outDir, "--no-git", "--force");
  assert.equal(r.status, 0, `init failed:\n${r.stdout}\n${r.stderr}`);
  return path.join(outDir, "acme-energy-hub");
}

// ── Determinism: two runs produce identical file trees ────────────────────────

test("two consecutive init runs produce the same file list", () => {
  const tmp1 = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-snap-a-"));
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-snap-b-"));
  try {
    const proj1 = generateProject(tmp1);
    const proj2 = generateProject(tmp2);
    const files1 = walkFiles(proj1).filter((f) => !f.startsWith(".git"));
    const files2 = walkFiles(proj2).filter((f) => !f.startsWith(".git"));
    assert.deepEqual(files1, files2, "file lists differ between runs");
  } finally {
    fs.rmSync(tmp1, { recursive: true, force: true });
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
});

test("two consecutive init runs produce identical spec.md content", () => {
  const tmp1 = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-snap-spec-a-"));
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-snap-spec-b-"));
  try {
    const proj1 = generateProject(tmp1);
    const proj2 = generateProject(tmp2);
    const s1 = fs.readFileSync(path.join(proj1, "spec.md"), "utf8");
    const s2 = fs.readFileSync(path.join(proj2, "spec.md"), "utf8");
    assert.equal(s1, s2, "spec.md content differs between runs");
  } finally {
    fs.rmSync(tmp1, { recursive: true, force: true });
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
});

test("two consecutive init runs produce identical traceability.md content", () => {
  const tmp1 = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-snap-trace-a-"));
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-snap-trace-b-"));
  try {
    const proj1 = generateProject(tmp1);
    const proj2 = generateProject(tmp2);
    const t1 = fs.readFileSync(path.join(proj1, "docs/specs/traceability.md"), "utf8");
    const t2 = fs.readFileSync(path.join(proj2, "docs/specs/traceability.md"), "utf8");
    assert.equal(t1, t2, "traceability.md content differs between runs");
  } finally {
    fs.rmSync(tmp1, { recursive: true, force: true });
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
});

// ── Golden snapshot: file tree matches committed baseline ─────────────────────

test("generated file list matches golden snapshot", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-snap-golden-"));
  try {
    const proj = generateProject(tmp);
    const files = walkFiles(proj).filter((f) => !f.startsWith(".git"));
    const goldenFile = path.join(GOLDEN_DIR, "file-list.txt");

    if (UPDATE || !fs.existsSync(goldenFile)) {
      fs.mkdirSync(GOLDEN_DIR, { recursive: true });
      fs.writeFileSync(goldenFile, files.join("\n") + "\n", "utf8");
      console.log(`[snapshot] Updated ${goldenFile} (${files.length} files)`);
      return;
    }

    const golden = fs.readFileSync(goldenFile, "utf8").trim().split("\n");
    assert.deepEqual(
      files,
      golden,
      "Generated file list differs from golden snapshot.\n" +
      "Run with UPDATE_SNAPSHOTS=1 to update the golden file if this change is intentional."
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("spec.md content matches golden snapshot", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-snap-spec-g-"));
  try {
    const proj = generateProject(tmp);
    const content = fs.readFileSync(path.join(proj, "spec.md"), "utf8");
    const goldenFile = path.join(GOLDEN_DIR, "spec.md");

    if (UPDATE || !fs.existsSync(goldenFile)) {
      fs.mkdirSync(GOLDEN_DIR, { recursive: true });
      fs.writeFileSync(goldenFile, content, "utf8");
      console.log(`[snapshot] Updated ${goldenFile}`);
      return;
    }

    const golden = fs.readFileSync(goldenFile, "utf8");
    assert.equal(content, golden,
      "spec.md content differs from golden snapshot.\n" +
      "Run with UPDATE_SNAPSHOTS=1 to update."
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("README.md content matches golden snapshot", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-snap-readme-g-"));
  try {
    const proj = generateProject(tmp);
    const content = fs.readFileSync(path.join(proj, "README.md"), "utf8");
    const goldenFile = path.join(GOLDEN_DIR, "README.md");

    if (UPDATE || !fs.existsSync(goldenFile)) {
      fs.mkdirSync(GOLDEN_DIR, { recursive: true });
      fs.writeFileSync(goldenFile, content, "utf8");
      console.log(`[snapshot] Updated ${goldenFile}`);
      return;
    }

    const golden = fs.readFileSync(goldenFile, "utf8");
    assert.equal(content, golden,
      "README.md content differs from golden snapshot.\n" +
      "Run with UPDATE_SNAPSHOTS=1 to update."
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
