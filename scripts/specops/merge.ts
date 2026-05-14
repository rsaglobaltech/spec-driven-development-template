"use strict";

/**
 * Three-way merge primitive for `specops sync`.
 *
 * Given the common ancestor (`base` — what the pack rendered last sync),
 * the working copy (`local` — what is in the project now, possibly
 * hand-edited) and the new render (`incoming` — what the pack renders at
 * the target version), produce a merged result.
 *
 * Delegates to `git merge-file`, which is always available wherever the
 * CLI runs (the project is a git repo by construction). `git merge-file`
 * exit codes: 0 = clean, N>0 = number of conflict regions, <0 = error.
 *
 * Pure-ish: writes only to a throwaway temp dir, never to the project.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_LABELS = {
  local: "local (your edits)",
  base: "base (last sync)",
  incoming: "incoming (new pack version)",
};

/**
 * @returns {{ merged: string, conflict: boolean, conflicts: number }}
 */
function threeWayMerge(base, local, incoming, labels = {}) {
  const lbl = { ...DEFAULT_LABELS, ...labels };
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "specops-merge-"));
  try {
    const localPath = path.join(tmpDir, "local");
    const basePath = path.join(tmpDir, "base");
    const incomingPath = path.join(tmpDir, "incoming");
    fs.writeFileSync(localPath, local, "utf8");
    fs.writeFileSync(basePath, base, "utf8");
    fs.writeFileSync(incomingPath, incoming, "utf8");

    const result = spawnSync(
      "git",
      [
        "merge-file",
        "-p",
        "-L",
        lbl.local,
        "-L",
        lbl.base,
        "-L",
        lbl.incoming,
        localPath,
        basePath,
        incomingPath,
      ],
      { encoding: "utf8" }
    );

    if (result.error) {
      throw new Error(`git merge-file failed to run: ${result.error.message}`);
    }
    if (typeof result.status !== "number" || result.status < 0) {
      throw new Error(`git merge-file errored: ${result.stderr || "unknown error"}`);
    }

    return {
      merged: result.stdout,
      conflict: result.status > 0,
      conflicts: result.status,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { threeWayMerge, DEFAULT_LABELS };
