"use strict";

/**
 * `csda agents init` — the generated instruction files.
 *
 * The property worth protecting is that these files stay thin. They point at
 * `csda change instructions`; they do not copy the delta grammar into markdown,
 * because a copy is stale the moment the grammar moves.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "../../..");
const CLI = path.join(ROOT_DIR, "bin", "create-spec-driven-app.js");

const { TOOLS, ALL_TOOLS, DEFAULT_TOOLS, parseArgs } = require("../../scripts/agents/init");
const { STEPS } = require("../../scripts/agents/commands");

function cli(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: ROOT_DIR });
}

function withProject(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-init-"));
  const r = cli(
    "init",
    "--config",
    path.join(ROOT_DIR, "examples/project.config.example"),
    "--out",
    root,
    "--force",
    "--no-git"
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  try {
    fn(path.join(root, "acme-energy-hub"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("--dry-run writes nothing", () => {
  withProject((dir) => {
    const r = cli("agents", "init", "--project-dir", dir, "--dry-run", "--json");
    assert.equal(r.status, 0, r.stderr);
    const doc = JSON.parse(r.stdout);
    assert.equal(doc.agents.dryRun, true);
    assert.ok(doc.agents.written.length > 0, "it still reports what it would write");
    for (const w of doc.agents.written) {
      assert.ok(!fs.existsSync(path.join(dir, w.path)), `${w.path} should not exist`);
    }
  });
});

test("a shared destination is written once, credited to both tools", () => {
  // Claude and Codex both read AGENTS.md; it used to appear twice.
  withProject((dir) => {
    const r = cli(
      "agents",
      "init",
      "--project-dir",
      dir,
      "--tool",
      "claude,codex",
      "--dry-run",
      "--json"
    );
    const doc = JSON.parse(r.stdout);
    // `csda init` already generates AGENTS.md, so here it lands in `skipped` —
    // what matters is that it appears exactly once, whichever list it is in.
    const planned = [...doc.agents.written, ...doc.agents.skipped].filter(
      (w) => w.path === "AGENTS.md"
    );
    assert.equal(planned.length, 1, "AGENTS.md should be planned once, not per tool");
    assert.equal(planned[0].tool, "claude+codex");
  });
});

test("existing files are never overwritten without --force", () => {
  withProject((dir) => {
    const target = path.join(dir, "CONVENTIONS.md");
    fs.writeFileSync(target, "hand-written, do not clobber\n", "utf8");

    const r = cli("agents", "init", "--project-dir", dir, "--tool", "aider", "--json");
    const doc = JSON.parse(r.stdout);
    assert.equal(doc.agents.skipped.length, 1);
    assert.equal(fs.readFileSync(target, "utf8"), "hand-written, do not clobber\n");
    // And it says so, with the way out.
    assert.equal(doc.status[0].code, "agent_file_exists");
    assert.match(doc.status[0].fix, /--force/);

    const forced = cli(
      "agents",
      "init",
      "--project-dir",
      dir,
      "--tool",
      "aider",
      "--force",
      "--json"
    );
    assert.equal(JSON.parse(forced.stdout).agents.written.length, 1);
    assert.match(fs.readFileSync(target, "utf8"), /Spec-Driven Development/);
  });
});

test("every step becomes a slash command that calls the engine", () => {
  withProject((dir) => {
    assert.equal(
      cli("agents", "init", "--project-dir", dir, "--tool", "claude", "--force").status,
      0
    );
    for (const step of STEPS) {
      const file = path.join(dir, ".claude/commands/csda", `${step.name}.md`);
      assert.ok(fs.existsSync(file), `${step.name} should have a slash command`);
      const body = fs.readFileSync(file, "utf8");
      assert.match(body, new RegExp(`# /csda:${step.name}`));
      // Thin by design: it defers to the engine rather than restating rules.
      assert.match(body, /csda change instructions/);
    }
  });
});

test("an unknown tool is a usage error listing the supported ones", () => {
  withProject((dir) => {
    const r = cli("agents", "init", "--project-dir", dir, "--tool", "clippy", "--json");
    assert.equal(r.status, 2);
    const doc = JSON.parse(r.stdout);
    assert.equal(doc.agents, null);
    assert.equal(doc.status[0].code, "tool_unknown");
    assert.match(doc.status[0].fix, /claude/);
  });
});

test("--tool defaults to every tool that belongs inside a project", () => {
  // Not quite every tool: `claude-plugin` produces an installable artefact,
  // and scattering one into every project that ran `agents init` is not what
  // anybody asked for. It is opt-in, and still selectable by name.
  assert.deepEqual(parseArgs([]).tools, DEFAULT_TOOLS);
  assert.ok(DEFAULT_TOOLS.length > 0);
  assert.deepEqual(
    ALL_TOOLS.filter((t: string) => !DEFAULT_TOOLS.includes(t)),
    ["claude-plugin"]
  );
  assert.deepEqual(parseArgs(["--tool", "claude, cursor"]).tools, ["claude", "cursor"]);
  assert.deepEqual(parseArgs(["--tool", "claude-plugin"]).tools, ["claude-plugin"]);
});

test("no generated file copies the delta grammar", () => {
  // The failure this guards against: a markdown file that restates the format
  // and then rots. Rules live in the engine; these files point at it.
  for (const tool of ALL_TOOLS) {
    for (const file of TOOLS[tool].files()) {
      assert.doesNotMatch(
        file.contents,
        /## ADDED Requirements[\s\S]*#### Scenario/,
        `${tool}:${file.path} should not inline a delta template`
      );
    }
  }
});
