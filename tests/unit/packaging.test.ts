/**
 * The published tarball only ships what `files` in package.json lists. The CLI
 * spans several top-level directories (dist/bin, dist/scripts, dist/packages/core),
 * so a new cross-directory import can leave the tarball missing a module that
 * every local build resolves fine. These tests walk the real require graph from
 * the shipped entry point and assert `files` still covers all of it.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const distDir = path.join(repoRoot, "dist");
const packageJson = require(path.join(repoRoot, "package.json"));

const { SURFACE } = require("../../scripts/lib/surface");

/** Entry points a user can reach: the bin shim plus every command it dispatches to. */
function entryPoints(): string[] {
  const entries = [path.join(distDir, "bin", "create-spec-driven-app.js")];
  for (const row of SURFACE) {
    if (!row.script) continue;
    entries.push(path.join(distDir, "scripts", ...row.script));
  }
  return entries.filter((f) => fs.existsSync(f));
}

/** Every relative `require(...)` specifier in a compiled CommonJS file. */
function relativeRequires(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  const specs: string[] = [];
  const re = /require\((['"])(\.[^'"]*)\1\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) specs.push(m[2]);
  return specs;
}

/** Transitive closure of first-party modules reachable from the CLI entry points. */
function reachableDistFiles(): Set<string> {
  const seen = new Set<string>();
  const queue = entryPoints();
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of relativeRequires(file)) {
      let resolved: string;
      try {
        resolved = require.resolve(spec, { paths: [path.dirname(file)] });
      } catch {
        continue; // optional or dynamically-guarded require
      }
      if (resolved.startsWith(distDir + path.sep)) queue.push(resolved);
    }
  }
  return seen;
}

/** True when a `files` entry (npm's directory-or-path form) covers a repo-relative path. */
function coveredByFiles(relPath: string): boolean {
  return (packageJson.files as string[]).some((entry) => {
    const normalised = entry.replace(/\/$/, "");
    return relPath === normalised || relPath.startsWith(normalised + "/");
  });
}

test("every module the CLI requires is inside a published `files` entry", () => {
  const reachable = reachableDistFiles();
  assert.ok(reachable.size > 0, "expected to walk a non-empty require graph");

  const missing = [...reachable]
    .map((f) => path.relative(repoRoot, f))
    .filter((rel) => !coveredByFiles(rel))
    .sort();

  assert.deepEqual(
    missing,
    [],
    `These modules load locally but are absent from the published tarball. ` +
      `Add their directory to "files" in package.json:\n  ${missing.join("\n  ")}`
  );
});

test("the CLI require graph really does span packages/core", () => {
  // Guards the test above against silently passing if the walk stops early.
  const reachable = [...reachableDistFiles()].map((f) => path.relative(repoRoot, f));
  assert.ok(
    reachable.some((rel) => rel.startsWith("dist/packages/core/")),
    "expected the walk to reach dist/packages/core; if core is genuinely unused, drop it from `files`"
  );
});
