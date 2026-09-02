/**
 * #167: the guard protected the contract but not the gate's own command.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import {
  resolveGateScript,
  npmScriptValue,
  makeTargetRecipe,
  gateCommandIntegrity,
} from "../../src/domain/GateCommandIntegrity";

const PKG = (testScript: string) =>
  JSON.stringify({ name: "x", scripts: { test: testScript, build: "tsc" } });

test("a gate command that names an npm script resolves to it", () => {
  assert.deepEqual(resolveGateScript("npm test"), { manifest: "package.json", script: "test" });
  assert.deepEqual(resolveGateScript("npm run verify"), {
    manifest: "package.json",
    script: "verify",
  });
  assert.deepEqual(resolveGateScript("pnpm run check"), {
    manifest: "package.json",
    script: "check",
  });
  assert.deepEqual(resolveGateScript("make check"), { manifest: "Makefile", script: "check" });
});

test("a command whose meaning is not in a readable file resolves to nothing", () => {
  // Saying "I did not look" beats guessing. mvn's behaviour lives in a plugin
  // graph; pytest's in configuration this would have to interpret.
  for (const cmd of ["mvn -B test", "pytest -q", "go test ./...", "./gradlew test", ""]) {
    assert.equal(resolveGateScript(cmd), null, `${cmd} should not resolve`);
  }
});

test("the measured attack: the agent rewrites the test script", () => {
  const before = PKG("node --test tests/*.test.js");
  const after = PKG("echo 'all good'");
  const r = gateCommandIntegrity("npm test", before, after);
  assert.equal(r.checked, true);
  assert.equal(r.changed, true);
  assert.equal(r.before, "node --test tests/*.test.js");
  assert.equal(r.after, "echo 'all good'");
});

test("adding a dependency is not a violation — that is legitimate work", () => {
  // A guard that blocks this gets turned off within a day, and then it
  // protects nothing.
  const before = JSON.stringify({ name: "x", scripts: { test: "node --test" } });
  const after = JSON.stringify({
    name: "x",
    scripts: { test: "node --test" },
    dependencies: { zod: "^3" },
  });
  assert.equal(gateCommandIntegrity("npm test", before, after).changed, false);
});

test("a script that appears where there was none is a change", () => {
  // Inventing the target the gate names is the same move as rewriting it.
  const before = JSON.stringify({ name: "x", scripts: { build: "tsc" } });
  const after = JSON.stringify({ name: "x", scripts: { build: "tsc", test: "true" } });
  const r = gateCommandIntegrity("npm test", before, after);
  assert.equal(r.checked, true);
  assert.equal(r.changed, true);
});

test("no such script either side is reported as not checked, never as passed", () => {
  const manifest = JSON.stringify({ name: "x", scripts: { build: "tsc" } });
  const r = gateCommandIntegrity("npm run nonexistent", manifest, manifest);
  assert.equal(r.checked, false);
  assert.equal(r.changed, false);
});

test("a Make target's recipe is compared, not the whole Makefile", () => {
  const before = "check:\n\tpytest -q\n\nbuild:\n\tcc -o x x.c\n";
  const afterWeakened = "check:\n\ttrue\n\nbuild:\n\tcc -o x x.c\n";
  const afterUnrelated = "check:\n\tpytest -q\n\nbuild:\n\tcc -O2 -o x x.c\n";

  assert.equal(makeTargetRecipe(before, "check"), "pytest -q");
  assert.equal(gateCommandIntegrity("make check", before, afterWeakened).changed, true);
  assert.equal(
    gateCommandIntegrity("make check", before, afterUnrelated).changed,
    false,
    "an edit to another target is not an edit to the gate"
  );
});

test("a manifest that stops parsing is not silently a pass", () => {
  const r = gateCommandIntegrity("npm test", PKG("node --test"), "{ not json");
  assert.equal(r.checked, true);
  assert.equal(r.changed, true, "unreadable after a readable script is a change, not a pass");
});

test("npmScriptValue tolerates junk", () => {
  assert.equal(npmScriptValue("{ not json", "test"), null);
  assert.equal(npmScriptValue(JSON.stringify({ scripts: { test: 5 } }), "test"), null);
  assert.equal(npmScriptValue(JSON.stringify({}), "test"), null);
});
