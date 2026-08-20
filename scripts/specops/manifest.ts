/**
 * `.specops/` baseline manifest — the missing "common ancestor" that lets
 * `specops sync` do conflict detection instead of blindly overwriting.
 *
 * Layout inside a project:
 *   .specops/
 *     manifest.json              index: pack_id -> { version, files: {rel: sha256} }
 *     baseline/<pack_id>/<rel>   verbatim copy of what the pack last rendered
 *
 * `expand` records the baseline after a remote pack expansion; `sync` reads
 * it back to classify each project file as unchanged / locally-edited /
 * cleanly-updatable / conflicting, and feeds base+local+incoming into a
 * three-way merge.
 *
 * The baseline tree is meant to be committed: a fresh clone needs it for
 * the next `sync` to have a merge base.
 *
 * Pure module: no logging, no process.exit. Throws on invalid input.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export const SPECOPS_DIR = ".specops";
export const BASELINE_DIRNAME = "baseline";
export const MANIFEST_FILENAME = "manifest.json";
export const MANIFEST_VERSION = 1;

export function manifestPath(projectDir) {
  return path.join(projectDir, SPECOPS_DIR, MANIFEST_FILENAME);
}

export function baselineDir(projectDir, packId) {
  return path.join(projectDir, SPECOPS_DIR, BASELINE_DIRNAME, packId);
}

export function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function newManifest() {
  return { specops_manifest_version: MANIFEST_VERSION, packs: {} };
}

/** Every writer here takes the same one flag: plan, or actually write. */
/** One file captured in a pack's baseline: where it lives, and what it said. */
export interface BaselineEntry {
  rel: string;
  content: string;
}

export interface WriteOptions {
  dryRun?: boolean;
}

/**
 * Read and parse `.specops/manifest.json`.
 * @returns Parsed manifest or `null` if the file does not exist.
 */
export function readManifest(projectDir) {
  const p = manifestPath(projectDir);
  if (!fs.existsSync(p)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    throw new Error(`Invalid ${SPECOPS_DIR}/${MANIFEST_FILENAME}: ${err.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${SPECOPS_DIR}/${MANIFEST_FILENAME}: root must be an object`);
  }
  if (!parsed.packs || typeof parsed.packs !== "object" || Array.isArray(parsed.packs)) {
    parsed.packs = {};
  }
  return parsed;
}

export function writeManifest(projectDir: string, manifest: unknown, options: WriteOptions = {}) {
  const p = manifestPath(projectDir);
  if (options.dryRun) return { path: p, written: false };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { path: p, written: true };
}

/**
 * Read a single baseline file's content.
 * @returns Content string or `null` when no baseline is recorded for it.
 */
export function readBaseline(projectDir, packId, rel) {
  const p = path.join(baselineDir(projectDir, packId), rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/**
 * Replace the recorded baseline for a pack with `entries` ([{ rel, content }]).
 * Wipes the pack's previous baseline tree first so files dropped by the pack
 * do not linger as phantom merge bases.
 */
export function snapshotBaseline(
  projectDir: string,
  packId: string,
  entries: readonly BaselineEntry[] | null | undefined,
  meta: Record<string, unknown> = {},
  options: WriteOptions = {}
) {
  if (options.dryRun) return { written: false, count: 0 };
  if (!packId) throw new Error("snapshotBaseline: packId is required");

  const baseDir = baselineDir(projectDir, packId);
  fs.rmSync(baseDir, { recursive: true, force: true });

  const hashes: Record<string, string> = {};
  for (const entry of entries || []) {
    if (!entry || !entry.rel) continue;
    const dest = path.join(baseDir, entry.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, entry.content, "utf8");
    hashes[entry.rel] = sha256(entry.content);
  }

  const manifest = readManifest(projectDir) || newManifest();
  manifest.packs[packId] = { version: meta.version || "", files: hashes };
  writeManifest(projectDir, manifest);

  return { written: true, count: Object.keys(hashes).length };
}
