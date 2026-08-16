/**
 * Unit tests for the Phase 2 setup commands' pure helpers:
 * config init (TEMPLATE) and completion (COMMANDS / script generators).
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import { TEMPLATE } from "../../scripts/config_init";
import { COMMANDS, SUBCOMMANDS, bashScript, zshScript } from "../../scripts/completion";

const ROOT_DIR = path.resolve(__dirname, "../../..");

test("config init TEMPLATE contains every required key", () => {
  for (const key of [
    "PROJECT_NAME",
    "PROJECT_SLUG",
    "PROJECT_TYPE",
    "DOMAIN",
    "STACK",
    "API_STYLE",
    "TESTING",
  ]) {
    assert.match(TEMPLATE, new RegExp(`^${key}:`, "m"), `${key} should be present`);
  }
});

test("completion COMMANDS lists the user-facing commands", () => {
  for (const cmd of ["init", "validate", "status", "req", "fix", "doctor", "completion"]) {
    assert.ok(COMMANDS.includes(cmd), `${cmd} should be completable`);
  }
});

test("bash completion script names the commands and registers the function", () => {
  const s = bashScript();
  assert.match(s, /complete -F _csda csda create-spec-driven-app/);
  assert.match(s, /status/);
  // sub-command case arms are present
  for (const sub of SUBCOMMANDS.req) assert.match(s, new RegExp(sub));
});

test("zsh completion script is compdef-tagged and registers the function", () => {
  const s = zshScript();
  assert.match(s, /#compdef csda/);
  assert.match(s, /compdef _csda csda create-spec-driven-app/);
  assert.match(s, /doctor/);
});

test("completion COMMANDS matches the CLI dispatch table exactly", () => {
  // Completion that advertises a command the CLI does not have — or omits one it
  // does — is worse than no completion. This is the guard that keeps the list in
  // step as commands are added.
  const bin = fs.readFileSync(path.join(ROOT_DIR, "bin", "create-spec-driven-app.ts"), "utf8");
  const dispatched = [...bin.matchAll(/command === "([a-z-]+)"/g)].map((m) => m[1]);

  const missing = dispatched.filter((c) => !COMMANDS.includes(c));
  assert.deepEqual(missing, [], `dispatched but not completable: ${missing.join(", ")}`);

  const stale = COMMANDS.filter((c) => !dispatched.includes(c));
  assert.deepEqual(stale, [], `completable but not dispatched: ${stale.join(", ")}`);
});
