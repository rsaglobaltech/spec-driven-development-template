/**
 * Unit tests for the Phase 2 setup commands' pure helpers:
 * config init (TEMPLATE) and completion (COMMANDS / script generators).
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { TEMPLATE } from "../../scripts/config_init";
import { COMMANDS, SUBCOMMANDS, bashScript, zshScript } from "../../scripts/completion";

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
