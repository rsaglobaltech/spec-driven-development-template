"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs, buildExpandArgs } = require("../../scripts/specops/sync");

// ── parseArgs ────────────────────────────────────────────────────────────────

test("parseArgs defaults projectDir to '.' when not provided", () => {
  const args = parseArgs([]);
  assert.equal(args.projectDir, ".");
  assert.equal(args.pack, "");
  assert.equal(args.packVersion, "");
  assert.equal(args.dryRun, false);
});

test("parseArgs accepts --project-dir, --pack, --pack-version, --cache-dir, --dry-run", () => {
  const args = parseArgs([
    "--project-dir",
    "./p",
    "--pack",
    "backend",
    "--pack-version",
    "v2.0.0",
    "--cache-dir",
    "/tmp/c",
    "--dry-run",
  ]);
  assert.equal(args.projectDir, "./p");
  assert.equal(args.pack, "backend");
  assert.equal(args.packVersion, "v2.0.0");
  assert.equal(args.cacheDir, "/tmp/c");
  assert.equal(args.dryRun, true);
});

test("parseArgs throws on unknown flag", () => {
  assert.throws(() => parseArgs(["--bogus"]), /Unknown argument/);
});

// ── buildExpandArgs ──────────────────────────────────────────────────────────

test("buildExpandArgs flattens lockfile vars to repeated --var args", () => {
  const entry = {
    repo: "https://example.com/r.git",
    pack_id: "backend",
    version: "v1.0.0",
    vars: { PROJECT_NAME: "Smart Parking", PROJECT_SLUG: "smart-parking" },
  };
  const args = buildExpandArgs(entry, "v1.0.0", "/project", "", false);
  assert.deepEqual(args.slice(0, 8), [
    "--pack-repo",
    "https://example.com/r.git",
    "--pack-version",
    "v1.0.0",
    "--pack",
    "backend",
    "--project-dir",
    "/project",
  ]);
  // --var KEY=VALUE pairs (order matches Object.entries)
  assert.ok(args.includes("--var"));
  assert.ok(args.includes("PROJECT_NAME=Smart Parking"));
  assert.ok(args.includes("PROJECT_SLUG=smart-parking"));
});

test("buildExpandArgs appends --cache-dir when provided", () => {
  const entry = { repo: "r", pack_id: "backend", version: "v1.0.0", vars: {} };
  const args = buildExpandArgs(entry, "v1.0.0", "/p", "/tmp/cache", false);
  assert.ok(args.includes("--cache-dir"));
  assert.ok(args.includes("/tmp/cache"));
});

test("buildExpandArgs appends --dry-run when requested", () => {
  const entry = { repo: "r", pack_id: "backend", version: "v1.0.0", vars: {} };
  const args = buildExpandArgs(entry, "v1.0.0", "/p", "", true);
  assert.ok(args.includes("--dry-run"));
});

test("buildExpandArgs uses the version override when different from entry", () => {
  const entry = { repo: "r", pack_id: "backend", version: "v1.0.0", vars: {} };
  const args = buildExpandArgs(entry, "v2.0.0", "/p", "", false);
  const idx = args.indexOf("--pack-version");
  assert.equal(args[idx + 1], "v2.0.0");
});

test("buildExpandArgs handles missing vars without throwing", () => {
  const entry = { repo: "r", pack_id: "backend", version: "v1.0.0" };
  assert.doesNotThrow(() => buildExpandArgs(entry, "v1.0.0", "/p", "", false));
});
