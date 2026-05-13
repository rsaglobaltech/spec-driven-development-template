"use strict";

/**
 * Tiny shared helper used by every command that operates on a project
 * directory (plan, done, specops sync/diff/add/remove).
 *
 * Auto-detection walks up from cwd looking for spec-driven sentinels:
 *   - spec.md
 *   - .specops.lock
 *   - specops.config.yaml
 *
 * The user can always override with `--project-dir <path>`.
 */

const fs = require("node:fs");
const path = require("node:path");

const SENTINELS = ["spec.md", ".specops.lock", "specops.config.yaml"];

function isSpecDrivenDir(dir) {
  for (const name of SENTINELS) {
    if (fs.existsSync(path.join(dir, name))) return true;
  }
  return false;
}

function findProjectRoot(start) {
  let dir = path.resolve(start);
  const { root } = path.parse(dir);
  while (true) {
    if (isSpecDrivenDir(dir)) return dir;
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

/**
 * Resolve a project directory:
 *   1. If `explicit` was passed (and is not the default "."), use it.
 *   2. Otherwise walk up from cwd looking for sentinels.
 *   3. Fall back to cwd.
 *
 * Pass `requireSentinel: true` to throw when no sentinel is found AND the
 * user did not pass --project-dir.
 */
function resolveProjectDir(explicit, opts) {
  const passed = explicit && explicit !== "." ? explicit : null;
  if (passed) return path.resolve(passed);

  const found = findProjectRoot(process.cwd());
  if (found) return found;

  if (opts && opts.requireSentinel) {
    throw new Error(
      "No spec-driven project detected in this directory tree. " +
        "Run from a directory that contains spec.md, .specops.lock, or specops.config.yaml, " +
        "or pass --project-dir explicitly."
    );
  }
  return path.resolve(process.cwd());
}

module.exports = { resolveProjectDir, findProjectRoot, isSpecDrivenDir, SENTINELS };
