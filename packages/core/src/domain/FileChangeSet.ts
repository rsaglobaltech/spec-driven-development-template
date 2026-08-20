/**
 * Comparing two renderings of the same pack, file by file.
 *
 * `specops diff` asks what a version bump would do to a project. The answer is
 * a classification over content hashes, which is judgement, not I/O: walking a
 * directory and hashing its files is the caller's job, and
 * `infrastructure/DirectorySnapshot` does it.
 *
 * The comparison is one-directional on purpose. A file present in the baseline
 * but absent from the candidate is not reported as removed, because `expand`
 * never deletes: it writes what the pack declares and leaves everything else
 * alone, so a file only the baseline has is a file the project owns.
 */

/** Relative POSIX path to the sha256 of its contents. */
export type FileHashes = ReadonlyMap<string, string>;

export interface FileChangeSet {
  added: string[];
  modified: string[];
  unchanged: string[];
}

/** Directories never worth walking into: caches, VCS metadata, build output. */
export const IGNORE_DIRS = new Set([".git", "node_modules", "_site", ".cache", ".specops"]);

/** Files a diff must not report on, because they describe the diff itself. */
export const IGNORE_FILES = new Set([".specops.lock"]);

export function classifyFileChanges(baseline: FileHashes, candidate: FileHashes): FileChangeSet {
  const added: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];

  for (const [rel, hash] of candidate) {
    const before = baseline.get(rel);
    if (before === undefined) added.push(rel);
    else if (before !== hash) modified.push(rel);
    else unchanged.push(rel);
  }

  return { added, modified, unchanged };
}
