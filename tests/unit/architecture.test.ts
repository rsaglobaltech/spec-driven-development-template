/**
 * The dependency rule, enforced.
 *
 * `packages/core` is the inner circle: domain, then application, then the
 * infrastructure adapters that implement the application's ports. `scripts/`
 * is the outer circle — argument parsing, terminal output, process exit.
 * Imports may only point inward. These tests fail the build when one does not,
 * because a single `../../../../scripts/...` import inside core is enough to
 * make core unextractable, and nothing else notices.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const coreSrc = path.join(repoRoot, "packages", "core", "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Every module specifier a file imports or re-exports from. */
function importSpecifiers(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  const specs: string[] = [];
  const re = /(?:from|require\()\s*(['"])([^'"]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) specs.push(m[2]);
  return specs;
}

/** Which circle a specifier resolves into, relative to the importing file. */
function targetLayer(file: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // node builtin or dependency
  const resolved = path.resolve(path.dirname(file), spec);
  const rel = path.relative(repoRoot, resolved);
  if (rel.startsWith("scripts" + path.sep) || rel === "scripts") return "scripts";
  const inCore = path.relative(coreSrc, resolved);
  if (inCore.startsWith("..")) return "outside";
  return inCore.split(path.sep)[0]; // domain | application | infrastructure
}

test("no module in packages/core imports from scripts/", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(coreSrc)) {
    for (const spec of importSpecifiers(file)) {
      if (targetLayer(file, spec) === "scripts") {
        offenders.push(`${path.relative(repoRoot, file)} → ${spec}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "core is the inner circle; these imports point outward at the CLI layer:\n  " +
      offenders.join("\n  ")
  );
});

test("packages/core imports nothing from outside its own src/", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(coreSrc)) {
    for (const spec of importSpecifiers(file)) {
      if (targetLayer(file, spec) === "outside") {
        offenders.push(`${path.relative(repoRoot, file)} → ${spec}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `core reaches outside its package:\n  ${offenders.join("\n  ")}`);
});

test("the domain layer depends on nothing but itself", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(path.join(coreSrc, "domain"))) {
    for (const spec of importSpecifiers(file)) {
      const layer = targetLayer(file, spec);
      if (layer !== null && layer !== "domain") {
        offenders.push(`${path.relative(repoRoot, file)} → ${spec} (${layer})`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `domain is the innermost circle and may import only domain:\n  ${offenders.join("\n  ")}`
  );
});

test("the application layer never depends on infrastructure", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(path.join(coreSrc, "application"))) {
    for (const spec of importSpecifiers(file)) {
      if (targetLayer(file, spec) === "infrastructure") {
        offenders.push(`${path.relative(repoRoot, file)} → ${spec}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "use cases must reach the outside through a port, never a concrete adapter:\n  " +
      offenders.join("\n  ")
  );
});

test("the domain layer performs no I/O", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(path.join(coreSrc, "domain"))) {
    for (const spec of importSpecifiers(file)) {
      // Only real I/O is banned. `crypto` and `path` are deliberately absent:
      // hashing a string and normalising one are pure computation, and the
      // domain needs `path` for the traversal checks that keep a pack template
      // inside its root — rules worth stating once, in the layer that owns
      // them, rather than hand-rolling string comparisons that can be bypassed.
      if (/^(node:)?(fs|fs\/promises|os|child_process|http|https|net|dns)$/.test(spec)) {
        offenders.push(`${path.relative(repoRoot, file)} → ${spec}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `domain must stay pure; move the I/O behind a port:\n  ${offenders.join("\n  ")}`
  );
});
