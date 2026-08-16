"use strict";

/**
 * Guard: docs/specs/traceability.md must not name a file that does not exist.
 *
 * The matrix is the project's own dogfooding artefact and it had rotted badly —
 * before this test it still pointed at `scripts/new_spec_project.sh`,
 * `scripts/validate_specs.sh` and `tests/shell/new_spec_project.bats`, all
 * deleted by ADR-0008 when the CLI went Node-only. A traceability matrix that
 * points at nothing is worse than none: it reads as a contract.
 *
 * Statuses stay a human judgement. This only enforces that the paths are real.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "../../..");
const MATRIX = path.join(ROOT_DIR, "docs", "specs", "traceability.md");

/** Looks like a repo path: has a slash, and an extension or a trailing slash. */
const PATH_LIKE = /^[\w.@-]+(?:\/[\w.*{},@-]+)+(?:\/)?$/;

/** `a/{b,c}.ts` → ["a/b.ts", "a/c.ts"] */
function expandBraces(token: string): string[] {
  const m = /^(.*)\{([^}]+)\}(.*)$/.exec(token);
  if (!m) return [token];
  return m[2].split(",").flatMap((part) => expandBraces(`${m[1]}${part.trim()}${m[3]}`));
}

/**
 * For a glob, the most we can honestly assert is that the directory it globs
 * inside exists — otherwise the pattern is pointing at nothing.
 */
function resolveTarget(token: string): string {
  if (!token.includes("*")) return token;
  const segments = token.split("/");
  const firstGlob = segments.findIndex((s) => s.includes("*"));
  return segments.slice(0, firstGlob).join("/");
}

function pathsNamedIn(markdown: string): string[] {
  const inline = [...markdown.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  const tokens = inline
    .filter((t) => PATH_LIKE.test(t))
    .flatMap(expandBraces)
    .map(resolveTarget)
    .filter(Boolean);
  return [...new Set(tokens)];
}

test("every path named in traceability.md exists on disk", () => {
  const markdown = fs.readFileSync(MATRIX, "utf8");
  const named = pathsNamedIn(markdown);

  // A matrix that names nothing would pass vacuously.
  assert.ok(named.length > 20, `expected the matrix to name many paths, found ${named.length}`);

  const missing = named.filter((rel) => !fs.existsSync(path.join(ROOT_DIR, rel)));
  assert.deepEqual(
    missing,
    [],
    `traceability.md names paths that do not exist:\n  ${missing.join("\n  ")}`
  );
});

test("brace and glob tokens resolve the way the guard assumes", () => {
  assert.deepEqual(expandBraces("scripts/change/{parser,delta}.ts"), [
    "scripts/change/parser.ts",
    "scripts/change/delta.ts",
  ]);
  assert.equal(resolveTarget("scripts/specops/*.ts"), "scripts/specops");
  assert.equal(resolveTarget("packages/*/test/unit/**"), "packages");
  assert.equal(resolveTarget("scripts/req.ts"), "scripts/req.ts");
});
