"use strict";

/**
 * `csda init --from-pack <repo>@<tag>` — the multi-repo answer.
 *
 * OpenSpec solves sharing specs across repositories with a central Store. This
 * repository already had the same capability in a different shape — a private
 * pack, versioned and pinned — so what was missing was one command instead of
 * two. The property worth protecting is the pin: an unpinned reference is
 * refused, because two services scaffolded a week apart silently getting
 * different requirements is the failure this is meant to prevent.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "../../..");
const CLI = path.join(ROOT_DIR, "bin", "create-spec-driven-app.js");

const { parseReference, newestProjectIn } = require("../../scripts/init_from_pack");

function cli(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: ROOT_DIR });
}

test("a reference splits on the last @, so scp-style git URLs still parse", () => {
  assert.deepEqual(parseReference("https://github.com/acme/x.git@v1.2.3"), {
    repo: "https://github.com/acme/x.git",
    version: "v1.2.3",
  });
  // git@github.com:acme/x.git@v1 — the first @ belongs to the user.
  assert.deepEqual(parseReference("git@github.com:acme/x.git@v1"), {
    repo: "git@github.com:acme/x.git",
    version: "v1",
  });
  assert.deepEqual(parseReference("https://github.com/acme/x.git"), {
    repo: "https://github.com/acme/x.git",
    version: null,
  });
});

test("an unpinned pack reference is refused", () => {
  const r = cli(
    "init",
    "--from-pack",
    "https://github.com/acme/x.git",
    "--pack",
    "backend",
    "--json"
  );
  assert.equal(r.status, 2);
  const doc = JSON.parse(r.stdout);
  assert.equal(doc.project, null);
  assert.equal(doc.status[0].code, "from_pack_unpinned");
  assert.match(doc.status[0].fix, /week apart/);
});

test("--pack is required — a repo may hold several", () => {
  const r = cli("init", "--from-pack", "https://github.com/acme/x.git@v1", "--json");
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).status[0].code, "pack_id_required");
});

test("newestProjectIn finds the scaffolded project, not any directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "from-pack-"));
  try {
    fs.mkdirSync(path.join(root, "not-a-project"));
    fs.mkdirSync(path.join(root, "a-project"));
    fs.writeFileSync(path.join(root, "a-project", "spec.md"), "# Spec\n", "utf8");
    assert.equal(newestProjectIn(root), path.join(root, "a-project"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("newestProjectIn returns null rather than guessing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "from-pack-empty-"));
  try {
    assert.equal(newestProjectIn(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
