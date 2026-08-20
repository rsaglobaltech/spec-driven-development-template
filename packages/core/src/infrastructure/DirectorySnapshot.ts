/**
 * A directory reduced to `relative path → content hash`.
 *
 * The unit `specops diff` compares. Hashing rather than reading means two
 * expansions of the same pack compare in constant memory per file, and a
 * file that was rewritten byte-identically reads as unchanged.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  FileChangeSet,
  IGNORE_DIRS,
  IGNORE_FILES,
  classifyFileChanges,
} from "../domain/FileChangeSet";

export function hashFile(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/** Every file under `root`, as relative POSIX paths. A missing root yields none. */
export function walkFiles(root: string): string[] {
  const out: string[] = [];
  function recurse(dir: string) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // an unreadable directory contributes nothing, it does not fail the diff
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        recurse(full);
      } else if (entry.isFile()) {
        if (IGNORE_FILES.has(entry.name)) continue;
        out.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  }
  if (fs.existsSync(root)) recurse(root);
  return out;
}

/** `root` as hashes, over the files `walkFiles` finds. */
export function snapshotDir(root: string): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const rel of walkFiles(root)) hashes.set(rel, hashFile(path.join(root, rel)));
  return hashes;
}

/**
 * What expanding the candidate over the baseline would change.
 *
 * Only the candidate is walked: the baseline is consulted per file, so a
 * baseline directory full of unrelated project files costs nothing.
 */
export function diffDirs(baselineDir: string, candidateDir: string): FileChangeSet {
  const candidate = snapshotDir(candidateDir);
  const baseline = new Map<string, string>();
  for (const rel of candidate.keys()) {
    const baselinePath = path.join(baselineDir, rel);
    if (fs.existsSync(baselinePath)) baseline.set(rel, hashFile(baselinePath));
  }
  return classifyFileChanges(baseline, candidate);
}
