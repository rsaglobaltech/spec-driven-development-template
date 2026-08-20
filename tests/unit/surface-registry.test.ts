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

const {
  SURFACE,
  commandNames,
  subcommandNames,
  jsonContractRows,
  helpRows,
  coreHelpRows,
  hiddenCommandCount,
} = require("../../scripts/lib/surface");
const { STEPS } = require("../../scripts/agents/commands");

const ROOT_DIR = path.resolve(__dirname, "../../..");
const BIN_SOURCE = fs.readFileSync(
  path.join(ROOT_DIR, "bin", "create-spec-driven-app.ts"),
  "utf8"
);

test("every registry command is dispatched by the CLI, and vice versa", () => {
  const dispatched = [...BIN_SOURCE.matchAll(/command === "([a-z-]+)"/g)].map((m) => m[1]);

  const undispatched = commandNames().filter((c: string) => !dispatched.includes(c));
  assert.deepEqual(undispatched, [], `declared but not dispatched: ${undispatched.join(", ")}`);

  const undeclared = dispatched.filter((c) => !commandNames().includes(c));
  assert.deepEqual(undeclared, [], `dispatched but not declared: ${undeclared.join(", ")}`);
});

test("every subcommand the registry declares is reachable", () => {
  // The dispatcher handles some sub-commands itself and passes the rest
  // through to the command's own script. A sub-command is reachable if either
  // place names it — but something must.
  const missing: string[] = [];
  for (const [command, subs] of Object.entries(subcommandNames())) {
    const row = SURFACE.find((c: any) => c.name === command);
    const ownScript = row.script
      ? path.join(ROOT_DIR, "scripts", ...row.script.map((s: string) => s.replace(/\.js$/, ".ts")))
      : null;
    const source =
      BIN_SOURCE + (ownScript && fs.existsSync(ownScript) ? fs.readFileSync(ownScript, "utf8") : "");
    for (const sub of subs as string[]) {
      if (!new RegExp(`["'\`]${sub}["'\`]|\\b${sub}:`).test(source)) {
        missing.push(`${command} ${sub}`);
      }
    }
  }
  assert.deepEqual(missing, [], `declared but unreachable: ${missing.join(", ")}`);
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
  assert.equal(
    new Set(invocations).size,
    invocations.length,
    "two rows claim the same invocation"
  );
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
  assert.deepEqual(unknown, [], `agent steps name commands that do not exist: ${unknown.join(", ")}`);
});
