/**
 * The surface registry is the single declaration of what this CLI can do.
 * These tests are the reason that claim holds: each one pins the registry to
 * a consumer that used to keep its own copy.
 *
 * The drift they exist to prevent is not hypothetical. `harness init`,
 * `change instructions`, `alm link` and `alm status` all shipped without ever
 * reaching the shell completion, because the guard compared only top-level
 * names by scraping the dispatcher with a regex.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

const {
  SURFACE,
  commandNames,
  subcommandNames,
  jsonContractRows,
  mcpTools,
  helpRows,
  coreHelpRows,
  hiddenCommandCount,
} = require("../../scripts/lib/surface");
const { STEPS } = require("../../scripts/agents/commands");
const { TOOLS } = require("../../packages/mcp-spec-driven/src/tools");

const ROOT_DIR = require("node:path").resolve(__dirname.split("/tests")[0].replace(/\/dist$/, ""));
const CLI_PATH = path.join(ROOT_DIR, "bin", "create-spec-driven-app.js");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    input: "",
  });
}

test("every command the registry declares actually routes", () => {
  // The dispatcher reads the registry, so this is the check that the reading
  // works end to end: a declared command must never come back as unknown.
  const unroutable: string[] = [];
  for (const name of commandNames()) {
    const r = runCli([name, "--help"]);
    if (/Unknown command/.test(`${r.stdout}${r.stderr}`)) unroutable.push(name);
  }
  assert.deepEqual(unroutable, [], `declared but unroutable: ${unroutable.join(", ")}`);
});

test("a command the registry does not declare is rejected", () => {
  // The other half: routing from a table is only a guarantee if the table is
  // also the limit of what is accepted.
  const r = runCli(["definitely-not-a-command"]);
  assert.equal(r.status, 2);
  assert.match(`${r.stdout}${r.stderr}`, /Unknown command/);
});

/**
 * The text of a command's implementation, following re-exports.
 *
 * The entry script the registry names is often a shim that re-exports the real
 * command, so reading that one file finds nothing. This walks the first-party
 * import graph from the entry point and concatenates it.
 */
function implementationText(entryFile: string): string {
  const seen = new Set<string>();
  const chunks: string[] = [];
  const queue = [entryFile];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(file, "utf8");
    chunks.push(text);

    for (const m of text.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const resolved = path.resolve(path.dirname(file), m[1]);
      for (const candidate of [`${resolved}.ts`, path.join(resolved, "index.ts")]) {
        if (fs.existsSync(candidate)) queue.push(candidate);
      }
    }
  }
  return chunks.join("\n");
}

test("a pass-through command's own script knows every sub-command declared for it", () => {
  // A command with its own script owns its sub-commands: the dispatcher hands
  // the tail over untouched, so the registry can drift from what the script
  // accepts without anything noticing. Table-routed sub-commands cannot drift
  // — the route is the declaration.
  const missing: string[] = [];
  for (const command of SURFACE) {
    if (!command.script) continue;
    const source = path.join(
      ROOT_DIR,
      "scripts",
      ...command.script.map((s: string) => s.replace(/\.js$/, ".ts"))
    );
    if (!fs.existsSync(source)) continue;
    const text = implementationText(source);
    for (const sub of (command.subcommands || []).map((s: any) => s.name)) {
      if (!new RegExp(`["'\`]${sub}["'\`]|\\b${sub}:`).test(text)) {
        missing.push(`${command.name} ${sub}`);
      }
    }
  }
  assert.deepEqual(missing, [], `declared but unknown to its script: ${missing.join(", ")}`);
});

test("every declared script exists", () => {
  const missing: string[] = [];
  const check = (label: string, script?: string[]) => {
    if (!script) return;
    const source = path.join(ROOT_DIR, "scripts", ...script).replace(/\.js$/, ".ts");
    if (!fs.existsSync(source)) missing.push(`${label} → ${script.join("/")}`);
  };
  for (const command of SURFACE) {
    check(command.name, command.script);
    for (const sub of command.subcommands || []) check(`${command.name} ${sub.name}`, sub.script);
  }
  assert.deepEqual(missing, [], `declared script does not exist: ${missing.join(", ")}`);
});

test("every command can be reached: it has a script, or all its subcommands do", () => {
  for (const command of SURFACE) {
    const routable =
      Boolean(command.script) ||
      ((command.subcommands || []).length > 0 &&
        command.subcommands.every((s: any) => Boolean(s.script)));
    assert.ok(routable, `${command.name} has no script and no fully-scripted subcommands`);
  }
});

test("the JSON contract rows are unique and carry a document key", () => {
  const rows = jsonContractRows();
  assert.ok(rows.length > 0);
  const invocations = rows.map((r: any) => r.command);
  assert.equal(new Set(invocations).size, invocations.length, "two rows claim the same invocation");
  for (const row of rows) {
    assert.ok(row.nullShapeKey, `${row.command} declares no document key`);
    assert.match(row.command, /(--json|--format json)$/, `${row.command} names no JSON flag`);
  }
});

test("a command on the daily surface is also on the full one", () => {
  // `--help` narrows; it never shows something `--help --all` hides.
  for (const command of SURFACE) {
    if (command.coreHelp) {
      assert.ok(command.help, `${command.name} is on the daily surface but not the full one`);
    }
  }
});

test("every help group has at least one row", () => {
  for (const { group, rows } of helpRows()) {
    assert.ok(rows.length > 0, `help group '${group}' is empty`);
  }
  for (const { group, rows } of coreHelpRows()) {
    assert.ok(rows.length > 0, `core help group '${group}' is empty`);
  }
});

test("the hidden-command count matches the registry", () => {
  const shown = coreHelpRows().reduce((n: number, g: any) => n + g.rows.length, 0);
  assert.equal(hiddenCommandCount(), SURFACE.length - shown);
});

test("every command the agent steps tell an agent to run exists", () => {
  // `scripts/agents/commands.ts` writes literal command strings into the file
  // every agent tool reads. A step that names a command the CLI dropped sends
  // an agent down a path that exits 2.
  const subs = subcommandNames();
  const unknown: string[] = [];
  for (const step of STEPS) {
    for (const line of step.run) {
      const [csda, command, maybeSub] = line.split(/\s+/);
      assert.equal(csda, "csda", `step '${step.name}' runs something other than csda: ${line}`);
      if (!commandNames().includes(command)) {
        unknown.push(line);
        continue;
      }
      const declared = subs[command];
      if (declared && maybeSub && !maybeSub.startsWith("-") && !declared.includes(maybeSub)) {
        unknown.push(line);
      }
    }
  }
  assert.deepEqual(
    unknown,
    [],
    `agent steps name commands that do not exist: ${unknown.join(", ")}`
  );
});

test("every MCP tool that fronts a command fronts one that exists", () => {
  // The MCP package publishes on its own, so it cannot read the registry at
  // runtime. Both sides declare the link instead, and this is where the two
  // declarations are made to agree — the drift would otherwise surface as an
  // agent calling a tool that shells out to a command the CLI dropped.
  const declared = mcpTools();
  const subs = subcommandNames();

  const unknown: string[] = [];
  for (const [tool, spec] of Object.entries(TOOLS) as [string, any][]) {
    if (!spec.csda) continue;
    const [command, sub] = spec.csda.split(" ");
    if (!commandNames().includes(command) || (sub && !(subs[command] || []).includes(sub))) {
      unknown.push(`${tool} → csda ${spec.csda}`);
    }
    assert.equal(
      declared[tool],
      spec.csda,
      `${tool} fronts '${spec.csda}' but the registry says '${declared[tool]}'`
    );
  }
  assert.deepEqual(
    unknown,
    [],
    `MCP tools front commands that do not exist: ${unknown.join(", ")}`
  );
});

test("every command the registry marks as MCP-exposed has a tool", () => {
  const missing = Object.keys(mcpTools()).filter((tool) => !(tool in TOOLS));
  assert.deepEqual(missing, [], `declared MCP tools that do not exist: ${missing.join(", ")}`);
});
