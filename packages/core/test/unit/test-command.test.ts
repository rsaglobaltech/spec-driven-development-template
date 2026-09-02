/**
 * Fase 2.3: two detectors disagreed on the same pom.xml.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { detectTestCommand } from "../../src/domain/TestCommand";

function files(map: Record<string, string | true>) {
  return {
    exists: (p: string) => Object.prototype.hasOwnProperty.call(map, p),
    read: (p: string) => (typeof map[p] === "string" ? (map[p] as string) : null),
  };
}

test("the wrapper wins, because the harness runs in a bare worktree", () => {
  // `./mvnw` is checked in and works there; `mvn` depends on the machine.
  // Getting this wrong burns one of the agent's three attempts on
  // "command not found".
  assert.equal(detectTestCommand(files({ "pom.xml": true, mvnw: true })), "./mvnw -B test");
  assert.equal(detectTestCommand(files({ "build.gradle": true, gradlew: true })), "./gradlew test");
});

test("without a wrapper, the system tool is the only option", () => {
  assert.equal(detectTestCommand(files({ "pom.xml": true })), "mvn -B test");
  assert.equal(detectTestCommand(files({ "build.gradle.kts": true })), "gradle test");
});

test("a declared npm script is the project's own answer", () => {
  assert.equal(
    detectTestCommand(files({ "package.json": '{"scripts":{"test":"vitest"}}' })),
    "npm test"
  );
});

test("a malformed package.json does not crash the caller", () => {
  assert.equal(detectTestCommand(files({ "package.json": "{ not json" })), "npm test");
});

test("the other ecosystems", () => {
  assert.equal(detectTestCommand(files({ "Cargo.toml": true })), "cargo test");
  assert.equal(detectTestCommand(files({ "go.mod": true })), "go test ./...");
  assert.equal(detectTestCommand(files({ "pyproject.toml": true })), "pytest");
  assert.equal(detectTestCommand(files({ "setup.py": true })), "pytest");
});

test("nothing recognisable returns null, and null is a real answer", () => {
  // Guessing `npm test` into a Python repository is how AI_RULES.md ended up
  // reading `Testing: unknown` two lines above `Test command: python -m pytest`.
  assert.equal(detectTestCommand(files({ "README.md": true })), null);
});

test("both callers would now agree on the same project", () => {
  const project = files({ "pom.xml": true, mvnw: true });
  assert.equal(detectTestCommand(project), detectTestCommand(project));
  assert.equal(detectTestCommand(project), "./mvnw -B test");
});
