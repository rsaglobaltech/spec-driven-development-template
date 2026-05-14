"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  MANIFEST_VERSION,
  manifestPath,
  baselineDir,
  sha256,
  newManifest,
  readManifest,
  readBaseline,
  snapshotBaseline,
} = require("../../scripts/specops/manifest");

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "specops-manifest-"));
}

test("readManifest returns null when no manifest exists", () => {
  const dir = tmpProject();
  try {
    assert.equal(readManifest(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readManifest throws on malformed JSON", () => {
  const dir = tmpProject();
  try {
    fs.mkdirSync(path.dirname(manifestPath(dir)), { recursive: true });
    fs.writeFileSync(manifestPath(dir), "{not-json", "utf8");
    assert.throws(() => readManifest(dir), /Invalid .specops\/manifest.json/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("newManifest has the current schema version and empty packs", () => {
  const m = newManifest();
  assert.equal(m.specops_manifest_version, MANIFEST_VERSION);
  assert.deepEqual(m.packs, {});
});

test("snapshotBaseline writes content tree and records hashes", () => {
  const dir = tmpProject();
  try {
    const entries = [
      { rel: "spec.md", content: "# Spec\n" },
      { rel: "docs/specs/events.md", content: "# Events\n" },
    ];
    const res = snapshotBaseline(dir, "backend", entries, { version: "v0.1.0" });
    assert.equal(res.written, true);
    assert.equal(res.count, 2);

    assert.equal(readBaseline(dir, "backend", "spec.md"), "# Spec\n");
    assert.equal(readBaseline(dir, "backend", "docs/specs/events.md"), "# Events\n");

    const manifest = readManifest(dir);
    assert.equal(manifest.packs.backend.version, "v0.1.0");
    assert.equal(manifest.packs.backend.files["spec.md"], sha256("# Spec\n"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("snapshotBaseline wipes stale files dropped by the pack", () => {
  const dir = tmpProject();
  try {
    snapshotBaseline(dir, "backend", [
      { rel: "keep.md", content: "keep\n" },
      { rel: "drop.md", content: "drop\n" },
    ]);
    snapshotBaseline(dir, "backend", [{ rel: "keep.md", content: "keep\n" }]);

    assert.equal(readBaseline(dir, "backend", "keep.md"), "keep\n");
    assert.equal(readBaseline(dir, "backend", "drop.md"), null);
    assert.equal(fs.existsSync(path.join(baselineDir(dir, "backend"), "drop.md")), false);

    const manifest = readManifest(dir);
    assert.deepEqual(Object.keys(manifest.packs.backend.files), ["keep.md"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("snapshotBaseline keeps separate baselines per pack", () => {
  const dir = tmpProject();
  try {
    snapshotBaseline(dir, "backend", [{ rel: "a.md", content: "backend\n" }]);
    snapshotBaseline(dir, "frontend", [{ rel: "a.md", content: "frontend\n" }]);
    assert.equal(readBaseline(dir, "backend", "a.md"), "backend\n");
    assert.equal(readBaseline(dir, "frontend", "a.md"), "frontend\n");
    const manifest = readManifest(dir);
    assert.deepEqual(Object.keys(manifest.packs).sort(), ["backend", "frontend"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("snapshotBaseline honours dryRun without touching the filesystem", () => {
  const dir = tmpProject();
  try {
    const res = snapshotBaseline(
      dir,
      "backend",
      [{ rel: "a.md", content: "x\n" }],
      {},
      { dryRun: true }
    );
    assert.equal(res.written, false);
    assert.equal(fs.existsSync(manifestPath(dir)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readBaseline returns null for an unknown file", () => {
  const dir = tmpProject();
  try {
    assert.equal(readBaseline(dir, "backend", "nope.md"), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
