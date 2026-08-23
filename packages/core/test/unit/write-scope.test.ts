/**
 * The write-scope guard (A1, closes H16).
 *
 * The prompt asks the agent not to touch the spec; until now nothing checked.
 * An agent that cannot make a scenario pass can relax the scenario instead, and
 * `validate --strict-tdd` approves — it verifies the feature exists and is in
 * the matrix, never that it still says what it said. "Specs as executable
 * contracts" stops being true when the executor may edit the contract.
 *
 * The glob matcher gets the most attention here because it is hand-written (no
 * runtime dependencies) and because a guard that silently matches nothing is
 * worse than no guard: it reports "clean" over an edited spec.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import {
  DEFAULT_PROTECTED_PATHS,
  checkWriteScope,
  matchesGlob,
  parseGitStatus,
  protectingPattern,
} from "../../src/domain/WriteScope";

// ── the matcher ──────────────────────────────────────────────────────────────

test("`*` stops at a directory separator and `**` crosses it", () => {
  assert.equal(matchesGlob("features/health.feature", "features/*.feature"), true);
  assert.equal(matchesGlob("features/core/health.feature", "features/*.feature"), false);
  assert.equal(matchesGlob("features/core/health.feature", "features/**/*.feature"), true);
  assert.equal(matchesGlob("features/a/b/c/health.feature", "features/**/*.feature"), true);
  // `**/` must also match zero directories, or the top level escapes the guard.
  assert.equal(matchesGlob("features/health.feature", "features/**/*.feature"), true);
});

test("a subtree pattern covers the directory and everything under it", () => {
  assert.equal(matchesGlob("docs/specs", "docs/specs/**"), true);
  assert.equal(matchesGlob("docs/specs/adr/0021-x.md", "docs/specs/**"), true);
  assert.equal(matchesGlob("docs/specs-other/x.md", "docs/specs/**"), false);
});

test("an exact name matches itself and nothing that merely contains it", () => {
  assert.equal(matchesGlob("spec.md", "spec.md"), true);
  assert.equal(matchesGlob("docs/spec.md", "spec.md"), false);
  assert.equal(matchesGlob("myspec.md", "spec.md"), false);
});

test("dots are literal, not any-character", () => {
  // `.specops.lock` as a regex would otherwise match `xspecopsxlock`.
  assert.equal(matchesGlob(".specops.lock", ".specops.lock"), true);
  assert.equal(matchesGlob("xspecopsxlock", ".specops.lock"), false);
});

test("windows separators are matched as the posix paths git reports", () => {
  assert.equal(matchesGlob("features\\core\\health.feature", "features/**/*.feature"), true);
});

// ── the rules ────────────────────────────────────────────────────────────────

test("the defaults protect every term of the contract", () => {
  for (const p of [
    "spec.md",
    "AI_RULES.md",
    "features/core/health.feature",
    "docs/specs/adr/0021-x.md",
    ".specops.lock",
    "harness.config.yaml",
  ]) {
    assert.ok(protectingPattern(p), `${p} should be protected by default`);
  }
  assert.equal(protectingPattern("src/main/java/App.java"), null);
  assert.equal(protectingPattern("README.md"), null);
});

test("allow_paths is an escape hatch, and it wins", () => {
  const rules = { allowPaths: ["features/legacy/**"] };
  assert.equal(protectingPattern("features/legacy/old.feature", rules), null);
  assert.ok(protectingPattern("features/core/health.feature", rules));
});

test("a project can name its own protected paths instead of the defaults", () => {
  const rules = { protectedPaths: ["contracts/**"] };
  assert.ok(protectingPattern("contracts/api.yaml", rules));
  // Naming your own list replaces the defaults; that is the point of naming it.
  assert.equal(protectingPattern("spec.md", rules), null);
});

test("editing a protected file is a violation, and the report says which rule", () => {
  const found = checkWriteScope({
    modified: ["features/core/health.feature", "src/App.java"],
    added: [],
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].path, "features/core/health.feature");
  assert.equal(found[0].pattern, "features/**/*.feature");
});

test("creating a feature that did not exist is allowed — NEEDS_FEATURE needs it", () => {
  // The distinction A1 asks for, and the one git already draws: new is not an
  // edit. A matrix row aims the gate at one specific file, so a new file cannot
  // loosen the contract being run.
  assert.deepEqual(
    checkWriteScope({ modified: [], added: ["features/core/new-thing.feature", "spec.md"] }),
    []
  );
});

test("deleting the declared feature is refused, not treated as a rewrite", () => {
  const found = checkWriteScope({
    modified: ["features/core/health.feature"],
    added: ["features/core/health-v2.feature"],
  });
  assert.equal(found.length, 1, "the deletion must still be caught");
});

test("violations come back sorted, so two runs read the same", () => {
  const found = checkWriteScope({ modified: ["spec.md", "AI_RULES.md"], added: [] });
  assert.deepEqual(
    found.map((v) => v.path),
    ["AI_RULES.md", "spec.md"]
  );
});

// ── reading git ──────────────────────────────────────────────────────────────

test("porcelain status separates new files from edits by their code", () => {
  const changes = parseGitStatus(
    [
      " M spec.md",
      "?? src/New.java",
      " D features/core/health.feature",
      "A  docs/specs/adr/0030-x.md",
      "",
    ].join("\n")
  );
  assert.deepEqual(changes.added, ["src/New.java"]);
  assert.deepEqual([...changes.modified].sort(), [
    "docs/specs/adr/0030-x.md",
    "features/core/health.feature",
    "spec.md",
  ]);
});

test("a rename counts both sides as edits", () => {
  const changes = parseGitStatus("R  spec.md -> spec-old.md\n");
  assert.deepEqual([...changes.modified].sort(), ["spec-old.md", "spec.md"]);
  assert.deepEqual(changes.added, []);
});

test("an empty status is not a violation", () => {
  assert.deepEqual(parseGitStatus(""), { modified: [], added: [] });
  assert.deepEqual(checkWriteScope(parseGitStatus("")), []);
});

test("the guard the defaults describe actually fires end to end", () => {
  // The failure this whole module exists to catch: an agent that could not pass
  // the scenario edited the scenario.
  const status = " M features/core/health.feature\n M src/App.java\n?? src/New.java\n";
  const found = checkWriteScope(parseGitStatus(status));
  assert.equal(found.length, 1);
  assert.equal(found[0].path, "features/core/health.feature");
  assert.ok(DEFAULT_PROTECTED_PATHS.includes(found[0].pattern));
});
