"use strict";

// csda:allow-placeholders — this module is the {{VAR}} scanner itself.

/**
 * The one unresolved-placeholder scan.
 *
 * `validate` and `doctor` each had their own copy, and they drifted: fixing
 * `validate` to skip dependency trees, template files and documentation that
 * quotes the syntax left `doctor` reporting 64 errors on this very repository,
 * every one of them a false positive. Two checkers answering the same question
 * differently is worse than one imperfect checker.
 */

const fs = require("node:fs");
const path = require("node:path");

const PLACEHOLDER_RE = /\{\{[A-Z_][A-Z0-9_]*\}\}/;

/**
 * Syntax-neutral on purpose: put it in whatever comment form the file uses —
 * `<!-- csda:allow-placeholders -->` in markdown, `// csda:allow-placeholders`
 * in code. Same convention as the `csda:trace` marker.
 */
const PLACEHOLDER_ALLOW_RE = /csda:allow-placeholders/;

/**
 * Never scanned: dependency trees and build output are not the project's specs,
 * and template libraries inside node_modules are full of {{...}} tokens that
 * would report as unresolved placeholders in any project with dependencies
 * installed.
 */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  "vendor",
  ".git",
  ".next",
  ".gradle",
  ".specops",
]);

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** True when the file is exempt for a stated reason, rather than by accident. */
function isExempt(file, content) {
  // A .tpl file is unrendered by definition — its {{VAR}} tokens are the point,
  // not a defect. Generated projects never contain .tpl files, so this does not
  // weaken the check for the projects the gate is aimed at; it only stops it
  // firing on template and pack repositories.
  if (file.endsWith(".tpl")) return true;
  // Documentation that explains the template syntax has to be able to quote it.
  // An explicit per-file opt-out keeps that honest: you have to say so.
  return PLACEHOLDER_ALLOW_RE.test(content);
}

/**
 * Every file under `rootDir` that still carries an unresolved `{{TOKEN}}`,
 * as paths relative to `rootDir` with POSIX separators.
 */
function findUnresolvedPlaceholders(rootDir) {
  const offenders = [];
  for (const file of walk(rootDir)) {
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (isExempt(file, content)) continue;
    if (PLACEHOLDER_RE.test(content)) {
      offenders.push(path.relative(rootDir, file).split(path.sep).join("/"));
    }
  }
  return offenders;
}

/** The distinct variable names still unresolved, for an actionable message. */
function missingVariables(rootDir, offenders) {
  const names = new Set();
  for (const rel of offenders) {
    let content;
    try {
      content = fs.readFileSync(path.join(rootDir, rel), "utf8");
    } catch {
      continue;
    }
    for (const m of content.matchAll(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g)) names.add(m[1]);
  }
  return [...names].sort();
}

module.exports = {
  PLACEHOLDER_RE,
  PLACEHOLDER_ALLOW_RE,
  SKIP_DIRS,
  walk,
  isExempt,
  findUnresolvedPlaceholders,
  missingVariables,
};
