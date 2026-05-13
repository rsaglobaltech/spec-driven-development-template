"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { readConfig, configToPacks, CONFIG_FILE } = require("../../scripts/specops/config");

function mktemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "specops-config-"));
}

// ── readConfig ────────────────────────────────────────────────────────────────

test("readConfig returns null when specops.config.yaml is absent", () => {
  const dir = mktemp();
  try {
    assert.equal(readConfig(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readConfig parses a minimal valid specops.config.yaml", () => {
  const dir = mktemp();
  try {
    fs.writeFileSync(
      path.join(dir, CONFIG_FILE),
      [
        "specops_version: 1",
        "packs:",
        "  - repo: https://example.com/r.git",
        "    version: v0.1.0",
        "    pack_id: backend",
      ].join("\n")
    );
    const config = readConfig(dir);
    assert.ok(config, "config should be non-null");
    assert.equal(config.specops_version, 1);
    assert.ok(Array.isArray(config.packs));
    assert.equal(config.packs.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── configToPacks ─────────────────────────────────────────────────────────────

test("configToPacks throws when packs is missing", () => {
  assert.throws(() => configToPacks({}), /packs.*non-empty/);
});

test("configToPacks throws when packs is empty", () => {
  assert.throws(() => configToPacks({ packs: [] }), /packs.*non-empty/);
});

test("configToPacks throws when repo is missing from an entry", () => {
  assert.throws(
    () => configToPacks({ packs: [{ version: "v1.0.0", pack_id: "backend" }] }),
    /missing 'repo'/
  );
});

test("configToPacks throws when version is missing from an entry", () => {
  assert.throws(
    () => configToPacks({ packs: [{ repo: "r", pack_id: "backend" }] }),
    /missing 'version'/
  );
});

test("configToPacks throws when pack_id is missing from an entry", () => {
  assert.throws(
    () => configToPacks({ packs: [{ repo: "r", version: "v1.0.0" }] }),
    /missing 'pack_id'/
  );
});

test("configToPacks converts entries to lockfile-compatible shape", () => {
  const config = {
    packs: [
      {
        repo: "https://example.com/r.git",
        version: "v0.1.0",
        pack_id: "backend",
        vars: { PROJECT_NAME: "App", PROJECT_SLUG: "app" },
      },
    ],
  };
  const packs = configToPacks(config);
  assert.equal(packs.length, 1);
  const p = packs[0];
  assert.equal(p.repo, "https://example.com/r.git");
  assert.equal(p.version, "v0.1.0");
  assert.equal(p.pack_id, "backend");
  assert.equal(p.vars.PROJECT_NAME, "App");
  assert.equal(p.vars.PROJECT_SLUG, "app");
  assert.equal(p.commit, "");
  assert.equal(p.expanded_at, "");
});

test("configToPacks defaults vars to empty object when absent", () => {
  const config = {
    packs: [{ repo: "r", version: "v1.0.0", pack_id: "backend" }],
  };
  const packs = configToPacks(config);
  assert.deepEqual(packs[0].vars, {});
});

test("configToPacks handles multiple packs", () => {
  const config = {
    packs: [
      { repo: "r", version: "v1.0.0", pack_id: "backend" },
      { repo: "r", version: "v1.0.0", pack_id: "frontend" },
    ],
  };
  const packs = configToPacks(config);
  assert.equal(packs.length, 2);
  assert.equal(packs[0].pack_id, "backend");
  assert.equal(packs[1].pack_id, "frontend");
});

// ── round-trip: readConfig → configToPacks ───────────────────────────────────

test("readConfig → configToPacks round-trip produces valid pack entries", () => {
  const dir = mktemp();
  try {
    fs.writeFileSync(
      path.join(dir, CONFIG_FILE),
      [
        "specops_version: 1",
        "packs:",
        "  - repo: https://github.com/rsaglobaltech/parking-management-specops.git",
        "    version: v0.1.0",
        "    pack_id: backend",
        "    vars:",
        "      PROJECT_NAME: Smart Parking",
        "      PROJECT_SLUG: smart-parking",
      ].join("\n")
    );
    const config = readConfig(dir);
    const packs = configToPacks(config);
    assert.equal(packs.length, 1);
    assert.equal(packs[0].vars.PROJECT_NAME, "Smart Parking");
    assert.equal(packs[0].vars.PROJECT_SLUG, "smart-parking");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
