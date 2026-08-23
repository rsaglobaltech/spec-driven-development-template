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

// ── `depends_on`, from the pack to the harness (B1) ──────────────────────────
//
// The last piece of B1. Ordering, stacking and the stale-base warning already
// existed; what was missing was a way for a *pack* to say REQ-002 builds on
// REQ-001. This walks the whole path: pack → expand → matrix → plan → harness.

test("a pack's depends_on reaches plan and stacks the harness branch", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "csda-dependson-"));
  try {
    // A curated pack with one dependency added. Using a real pack rather than a
    // fixture keeps this honest about the shape packs actually have.
    const packRoot = path.join(parent, "packs");
    fs.mkdirSync(packRoot, { recursive: true });
    fs.cpSync(path.join(PACKS_DIR, "billing"), path.join(packRoot, "billing"), {
      recursive: true,
    });
    const packYaml = path.join(packRoot, "billing", "backend", "pack.yaml");
    fs.writeFileSync(
      packYaml,
      fs
        .readFileSync(packYaml, "utf8")
        .replace("  - id: REQ-002\n", "  - id: REQ-002\n    depends_on: [REQ-001]\n"),
      "utf8"
    );

    const lint = spawnSync(
      process.execPath,
      [CLI, "pack", "lint", "--pack-root", packRoot, "--pack", "billing/backend"],
      { encoding: "utf8" }
    );
    assert.equal(lint.status, 0, `depends_on must not break lint:\n${lint.stdout}${lint.stderr}`);

    const init = spawnSync(
      process.execPath,
      [CLI, "init", "--yes", "--no-sample-req", "--out", parent, "--no-git"],
      { encoding: "utf8" }
    );
    assert.equal(init.status, 0, init.stdout + init.stderr);
    const projectDir = path.join(
      parent,
      fs.readdirSync(parent).find((d) => d !== "packs")
    );

    const expand = spawnSync(
      process.execPath,
      [
        CLI,
        "expand",
        "--pack-root",
        packRoot,
        "--pack",
        "billing/backend",
        "--project-dir",
        projectDir,
        "--var",
        "PROJECT_NAME=Dep",
        "--var",
        "PROJECT_SLUG=dep",
        "--var",
        "DOMAIN=dep",
      ],
      { encoding: "utf8" }
    );
    assert.equal(expand.status, 0, expand.stdout + expand.stderr);

    // The matrix carries it, beneath the table where a rebuild will not lose it.
    const matrix = fs.readFileSync(path.join(projectDir, "docs/specs/traceability.md"), "utf8");
    assert.match(matrix, /<!-- csda:trace REQ-002 depends=REQ-001 -->/, matrix.slice(-400));

    // `plan` reads it, and orders REQ-002 behind REQ-001.
    const planned = spawnSync(
      process.execPath,
      [CLI, "plan", "--project-dir", projectDir, "--format", "json"],
      { encoding: "utf8" }
    );
    const plan = JSON.parse(planned.stdout);
    const req002 = plan.requirements.find((r: any) => r.requirement === "REQ-002");
    assert.deepEqual(req002.dependsOn, ["REQ-001"]);
    assert.deepEqual(req002.blockedBy, ["REQ-001"], "REQ-001 has not been done yet");

    // And the harness cuts REQ-002 from REQ-001's branch, not from the base.
    const git = (...args: string[]) =>
      spawnSync("git", args, { cwd: projectDir, encoding: "utf8" });
    git("init", "-q");
    git("add", "-A");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "seed");

    const run = spawnSync(
      process.execPath,
      [
        CLI,
        "harness",
        "run",
        "--project-dir",
        projectDir,
        "--agent",
        "true {prompt_file}",
        "--max-attempts",
        "1",
      ],
      { encoding: "utf8" }
    );
    const log = git("log", "--oneline", "harness/REQ-002").stdout;
    assert.match(
      log,
      /feat\(REQ-001\)/,
      `REQ-002 was not cut from its predecessor's branch:\n${log}\n${run.stdout}${run.stderr}`
    );

    // And it is never reported as blocked by a predecessor that passed in this
    // very run — the plan's `blockedBy` is a snapshot taken before it started.
    assert.doesNotMatch(
      run.stdout + run.stderr,
      /REQ-002: it depends on REQ-001, which is not done/,
      "a stale blocker would skip work the scheduler had correctly unblocked"
    );
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
