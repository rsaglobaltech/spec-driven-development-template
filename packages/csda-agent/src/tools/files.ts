/**
 * File access, confined to the project.
 *
 * The agent writes specs, deltas, proposals and `.feature` files — so it needs
 * real write access — but every path is resolved and checked against the
 * project root before anything is opened. `..`, an absolute path elsewhere, or
 * a symlink pointing out are all rejected, and rejected on the *resolved*
 * path rather than on the string the model supplied.
 *
 * There is no delete tool and no rename tool. Removing work is a decision for
 * a human with `git`, not something an agent should be able to do in passing.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface FileScope {
  root: string;
  /** Extra roots opened explicitly by the user. */
  additionalRoots: string[];
  /** Globs, relative to root, the agent may write to. */
  writable: string[];
}

export const DEFAULT_WRITABLE = [
  "docs/**",
  "features/**",
  "spec.md",
  "AI_RULES.md",
  "AGENTS.md",
  "*.yaml",
  "*.yml",
  "*.config",
];

export class PathError extends Error {}

/**
 * The canonical form of a path, following symlinks.
 *
 * A path that does not exist yet is canonicalised through its nearest existing
 * ancestor, so a file about to be created inside a symlinked directory is
 * judged by where it will really land — on macOS `/var` is a symlink to
 * `/private/var`, and comparing the two spellings makes every write under
 * a temp directory look like an escape.
 */
function canonicalise(target: string): string {
  const resolved = path.resolve(target);
  try {
    return fs.realpathSync(resolved);
  } catch {
    let dir = path.dirname(resolved);
    while (dir !== path.dirname(dir)) {
      try {
        return path.join(fs.realpathSync(dir), path.relative(dir, resolved));
      } catch {
        dir = path.dirname(dir);
      }
    }
    return resolved;
  }
}

/** Resolve a model-supplied path, or throw. Never returns a path outside scope. */
export function resolveInScope(input: string, scope: FileScope): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new PathError("A path is required.");
  }
  const canonical = canonicalise(path.resolve(scope.root, input));

  const roots = [scope.root, ...scope.additionalRoots].map(canonicalise);

  const inside = roots.some(
    (root) => canonical === root || canonical.startsWith(`${root}${path.sep}`)
  );
  if (!inside) {
    throw new PathError(
      `Path is outside the project: ${input}. The agent may only touch files under ${scope.root}.`
    );
  }
  return canonical;
}

function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
      continue;
    }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/**
 * Canonicalise a root so it can be compared with a realpath'd target.
 *
 * `resolveInScope` returns the canonical path, and on macOS `/var` is a
 * symlink to `/private/var` — comparing a canonical target against a raw root
 * yields `../../..` and every write looks like an escape.
 */
const canonicalRoot = (dir: string) => canonicalise(dir);

export function isWritable(absolutePath: string, scope: FileScope): boolean {
  const relative = path
    .relative(canonicalRoot(scope.root), canonicalise(absolutePath))
    .split(path.sep)
    .join("/");
  if (relative.startsWith("..")) return false;
  return scope.writable.some((pattern) => globToRegExp(pattern).test(relative));
}

export function readFileInScope(input: string, scope: FileScope): string {
  const file = resolveInScope(input, scope);
  if (!fs.existsSync(file)) throw new PathError(`File does not exist: ${input}`);
  if (fs.statSync(file).isDirectory()) throw new PathError(`${input} is a directory.`);
  const content = fs.readFileSync(file, "utf8");
  const MAX = 200_000;
  return content.length > MAX
    ? `${content.slice(0, MAX)}\n… file truncated at ${MAX} characters`
    : content;
}

export function writeFileInScope(input: string, contents: string, scope: FileScope): string {
  const file = resolveInScope(input, scope);
  if (!isWritable(file, scope)) {
    const relative = path.relative(canonicalRoot(scope.root), file);
    throw new PathError(
      `Not writable: ${relative}. The agent may write to: ${scope.writable.join(", ")}.`
    );
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
  return path.relative(canonicalRoot(scope.root), file);
}

/**
 * Replace an exact string, once.
 *
 * Refuses when the match is absent or ambiguous rather than guessing — an edit
 * applied to the wrong occurrence is worse than an edit that failed loudly.
 */
export function editFileInScope(
  input: string,
  oldString: string,
  newString: string,
  scope: FileScope
): string {
  const file = resolveInScope(input, scope);
  if (!isWritable(file, scope)) {
    throw new PathError(`Not writable: ${path.relative(scope.root, file)}.`);
  }
  if (!fs.existsSync(file)) throw new PathError(`File does not exist: ${input}`);

  const content = fs.readFileSync(file, "utf8");
  const occurrences = content.split(oldString).length - 1;
  if (occurrences === 0) throw new PathError(`The text to replace was not found in ${input}.`);
  if (occurrences > 1) {
    throw new PathError(
      `The text to replace appears ${occurrences} times in ${input}; include more surrounding context so it is unique.`
    );
  }
  fs.writeFileSync(file, content.replace(oldString, newString), "utf8");
  return path.relative(canonicalRoot(scope.root), file);
}

/** List files under a directory, relative to the project root. */
export function listFilesInScope(input: string, scope: FileScope, limit = 500): string[] {
  const dir = resolveInScope(input || ".", scope);
  if (!fs.existsSync(dir)) throw new PathError(`Directory does not exist: ${input}`);
  const out: string[] = [];
  const skip = new Set(["node_modules", ".git", "dist", "coverage", "_site"]);

  const walk = (current: string) => {
    if (out.length >= limit) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (out.length >= limit) return;
      if (skip.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(canonicalRoot(scope.root), full).split(path.sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}
