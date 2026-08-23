"use strict";

/**
 * Guard: every pack this repository ships must be installable.
 *
 * Nothing exercised `packs/` — not CI, not a test — so all eleven curated
 * packs drifted onto a format the installer never accepted, and `pack lint`
 * said they were fine because it only checked cross-references. A pack you
 * cannot install is not a pack; it is a YAML file.
 *
 * This is the cheapest possible guard against that recurring: lint each pack
 * the way a user would, and expand it into a real scaffolded project.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "../../..");
const CLI = path.join(ROOT_DIR, "bin", "create-spec-driven-app.js");
const { loadPack } = require("../../packages/core/src/infrastructure/DiskPackRepository");
const PACKS_DIR = path.join(ROOT_DIR, "packs");

/** Variables beyond the usual three that a pack may declare. */
const EXTRA_VARS = {
  "sample-contracts/contracts": ["PROVIDER_SERVICE=billing", "CONSUMER_SERVICE=web"],
};

function packIds() {
  const ids = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "pack.yaml") {
        ids.push(path.relative(PACKS_DIR, path.dirname(full)).split(path.sep).join("/"));
      }
    }
  };
  walk(PACKS_DIR);
  return ids.sort();
}

const IDS = packIds();

test("the repository actually ships curated packs", () => {
  // If this ever reads zero, every test below would vacuously pass.
  assert.ok(IDS.length > 0, "no pack.yaml found under packs/");
});

for (const id of IDS) {
  test(`pack ${id} passes lint`, () => {
    const r = spawnSync(
      process.execPath,
      [CLI, "pack", "lint", "--pack-root", PACKS_DIR, "--pack", id],
      {
        encoding: "utf8",
      }
    );
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  });

  test(`pack ${id} installs into a scaffolded project`, () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "csda-packs-"));
    try {
      const init = spawnSync(
        process.execPath,
        [CLI, "init", "--yes", "--no-sample-req", "--out", parent, "--no-git"],
        { encoding: "utf8" }
      );
      assert.equal(init.status, 0, init.stdout + init.stderr);
      const projectDir = path.join(parent, fs.readdirSync(parent)[0]);

      const vars = ["PROJECT_NAME=Guard", "PROJECT_SLUG=guard", "DOMAIN=guard"]
        .concat(EXTRA_VARS[id] || [])
        .flatMap((v) => ["--var", v]);

      const r = spawnSync(
        process.execPath,
        [
          CLI,
          "expand",
          "--pack-root",
          PACKS_DIR,
          "--pack",
          id,
          "--project-dir",
          projectDir,
          ...vars,
        ],
        { encoding: "utf8" }
      );
      assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);

      // Installing is not enough: the documents have to carry what the pack
      // declared. The schema said `context` and `invariants`, the packs write
      // `bounded_context` and `responsibilities`, and the renderer read the
      // schema's names — so every curated pack installed cleanly and produced
      // `| AGG-001 | Invoice | - | - |`. H13 was not paperwork; it shipped a
      // worse product (E1).
      const { pack } = loadPack(PACKS_DIR, id);

      const aggregate = (pack.aggregates || []).find((a: any) => a.bounded_context || a.context);
      if (aggregate) {
        const rendered = fs.readFileSync(path.join(projectDir, "docs/specs/aggregates.md"), "utf8");
        const row = rendered.split("\n").find((l: string) => l.includes(`| ${aggregate.id} `));
        assert.ok(row, `no row for ${aggregate.id} in aggregates.md`);
        assert.ok(
          row.includes(aggregate.bounded_context || aggregate.context),
          `${id}: the aggregate's context is missing from the rendered row:\n  ${row}`
        );
      }

      const event = (pack.events || []).find((e: any) => e.producer || e.aggregate);
      if (event) {
        const rendered = fs.readFileSync(path.join(projectDir, "docs/specs/events.md"), "utf8");
        const row = rendered.split("\n").find((l: string) => l.includes(`| ${event.id} `));
        assert.ok(row, `no row for ${event.id} in events.md`);
        assert.ok(
          row.includes(event.producer || event.aggregate),
          `${id}: the event's producer is missing from the rendered row:\n  ${row}`
        );
      }
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
}

test("no shipped pack declares a schema newer than this CLI reads", () => {
  const { PACK_SCHEMA_VERSION, isNewerThan } = require("../../packages/core/src/domain/PackSpec");
  for (const id of IDS) {
    const raw = fs.readFileSync(path.join(PACKS_DIR, id, "pack.yaml"), "utf8");
    const declared = /schema_version:\s*"([^"]+)"/.exec(raw);
    if (!declared) continue;
    assert.equal(
      isNewerThan(declared[1], PACK_SCHEMA_VERSION),
      false,
      `${id} declares ${declared[1]}, newer than ${PACK_SCHEMA_VERSION}`
    );
  }
});

test("no shipped pack uses `rules` for domain rules", () => {
  // `rules` is render configuration; invariants belong in `business_rules`.
  // Conflating them is what made every curated pack uninstallable.
  for (const id of IDS) {
    const raw = fs.readFileSync(path.join(PACKS_DIR, id, "pack.yaml"), "utf8");
    const rulesBlock = /^rules:\n((?:[ \t].*\n|\n)*)/m.exec(raw);
    if (!rulesBlock) continue;
    assert.ok(
      !/^\s+- id: RUL-/m.test(rulesBlock[1]),
      `${id} lists RUL-* under \`rules\` — move them to \`business_rules\``
    );
  }
});
