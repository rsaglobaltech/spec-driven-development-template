"use strict";

/**
 * `.specops.lock` — records which remote pack(s) were expanded into a project.
 *
 * Lockfile format (JSON):
 *   {
 *     "specops_version": 1,
 *     "csda_version": "0.1.0-beta.4",
 *     "packs": [
 *       {
 *         "repo":        "https://github.com/.../parking-management-specops.git",
 *         "version":     "v0.1.0",
 *         "commit":      "c37fbcb...",
 *         "pack_id":     "backend",
 *         "expanded_at": "2026-05-12T18:30:00.000Z"
 *       }
 *     ]
 *   }
 *
 * Pure module: no logging, no process.exit. Throws on invalid input.
 */

const fs = require("node:fs");
const path = require("node:path");

const LOCK_FILENAME = ".specops.lock";
const SPECOPS_SCHEMA_VERSION = 1;

/**
 * Read and parse `.specops.lock` from a project directory.
 * @returns Parsed lock object or `null` if the file does not exist.
 */
function readLock(projectDir) {
  const lockPath = path.join(projectDir, LOCK_FILENAME);
  if (!fs.existsSync(lockPath)) return null;
  const raw = fs.readFileSync(lockPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid ${LOCK_FILENAME}: ${err.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${LOCK_FILENAME}: root must be an object`);
  }
  if (!Array.isArray(parsed.packs)) parsed.packs = [];
  return parsed;
}

/**
 * Update or insert a pack entry by (repo, pack_id) and return the updated lock.
 */
function upsertPackEntry(lock, entry) {
  if (!entry || !entry.repo || !entry.pack_id) {
    throw new Error("upsertPackEntry: entry.repo and entry.pack_id are required");
  }
  const next = lock || newLock();
  if (!Array.isArray(next.packs)) next.packs = [];

  const idx = next.packs.findIndex((p) => p.repo === entry.repo && p.pack_id === entry.pack_id);
  if (idx >= 0) next.packs[idx] = { ...next.packs[idx], ...entry };
  else next.packs.push({ ...entry });

  next.packs.sort((a, b) => {
    const r = String(a.repo).localeCompare(String(b.repo));
    return r !== 0 ? r : String(a.pack_id).localeCompare(String(b.pack_id));
  });
  return next;
}

/**
 * Write a lock object to `<projectDir>/.specops.lock`.
 * No-op when `dryRun` is true (returns the path that would have been written).
 */
function writeLock(projectDir, lock, options = {}) {
  const lockPath = path.join(projectDir, LOCK_FILENAME);
  const json = `${JSON.stringify(lock, null, 2)}\n`;
  if (options.dryRun) return { path: lockPath, written: false };
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(lockPath, json, "utf8");
  return { path: lockPath, written: true };
}

function newLock(csdaVersion) {
  return {
    specops_version: SPECOPS_SCHEMA_VERSION,
    csda_version: csdaVersion || "0.0.0",
    packs: [],
  };
}

module.exports = {
  LOCK_FILENAME,
  SPECOPS_SCHEMA_VERSION,
  readLock,
  writeLock,
  upsertPackEntry,
  newLock,
};
