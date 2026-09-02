/**
 * The decisions `init --multi-stack` makes before it touches a disk.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import {
  planStacks,
  renderSpecopsConfig,
  relativeToRoot,
  InvalidStackList,
} from "../../src/domain/MultiStack";
import { parseYamlLite } from "../../src/domain/YamlLite";

test("a comma-separated list becomes one project entry per stack", () => {
  const plan = planStacks("spring,quarkus,micronaut");
  assert.deepEqual(
    plan.stacks.map((s) => s.name),
    ["spring", "quarkus", "micronaut"]
  );
  assert.deepEqual(
    plan.stacks.map((s) => s.entry),
    ["./spring", "./quarkus", "./micronaut"]
  );
});

test("whitespace around the commas is the user being tidy, not an error", () => {
  const plan = planStacks(" spring , quarkus ");
  assert.deepEqual(
    plan.stacks.map((s) => s.name),
    ["spring", "quarkus"]
  );
});

test("one stack is plain init, and says so", () => {
  assert.throws(
    () => planStacks("spring"),
    (e: any) => {
      assert.ok(e instanceof InvalidStackList);
      assert.match(e.message, /plain `specgate init`/);
      return true;
    }
  );
  assert.throws(() => planStacks(""), InvalidStackList);
  assert.throws(() => planStacks("  ,  "), InvalidStackList);
});

test("a stack name that would escape the root is refused", () => {
  // `projects:` already takes relative paths nobody checks stay inside the
  // repository. No reason to open a second door to the same place.
  for (const bad of ["../etc", "..", ".", "a/b", "/abs"]) {
    assert.throws(() => planStacks(`spring,${bad}`), InvalidStackList, `${bad} should be refused`);
  }
});

test("the same stack twice is refused — each stack is one directory", () => {
  assert.throws(
    () => planStacks("spring,Spring"),
    (e: any) => {
      assert.match(e.message, /listed twice/);
      return true;
    }
  );
});

test("the generated config is readable by the parser that will read it", () => {
  // A writer that emits something its own reader rejects is worse than none.
  const yaml = renderSpecopsConfig(planStacks("spring,quarkus"), "acme-api");
  const parsed: any = parseYamlLite(yaml);
  assert.equal(parsed.name, "acme-api");
  assert.deepEqual(parsed.projects, ["./spring", "./quarkus"]);
});

test("a shared path is reached from the right depth", () => {
  assert.equal(relativeToRoot("spec.md"), "../spec.md");
  assert.equal(relativeToRoot("features"), "../features");
  assert.equal(relativeToRoot("docs/specs/adr"), "../../../docs/specs/adr");
});
