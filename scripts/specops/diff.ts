#!/usr/bin/env node
"use strict";

/**
 * `specops diff` — shows what would change in the project if each pack
 * in `.specops.lock` were re-expanded (optionally at a different
 * `--pack-version`). Writes nothing to the project directory.
 *
 * Strategy:
 *   1. For each pack entry: expand into a temp dir with the chosen version
 *   2. Walk the temp dir and compare each generated file to the project copy
 *      (sha256 of the bytes is enough — render is deterministic for a fixed
 *      pack version + vars)
 *   3. Emit a per-pack summary listing added (+) and modified (~) files
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const { readLock } = require("./lock");

const EXPAND_SCRIPT = path.join(__dirname, "..", "expand_domain_pack.js");
const LOCK_FILENAME = ".specops.lock";

function info(msg) {
  process.stdout.write(`ℹ️ [INFO] ${msg}\n`);
}
function error(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  create-spec-driven-app specops diff [--project-dir <path>] [--pack <pack-id>] [--pack-version <tag>] [--cache-dir <path>]\n\n" +
      "Reports files that would be added or modified if `specops sync` ran at\n" +
      "the chosen version. Writes nothing to the project directory.\n"
  );
}

function parseArgs(argv) {
  const args = {
    projectDir: ".",
    pack: "",
    packVersion: "",
    cacheDir: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--project-dir") {
      args.projectDir = argv[++i] || "";
      continue;
    }
    if (token === "--pack") {
      args.pack = argv[++i] || "";
      continue;
    }
    if (token === "--pack-version") {
      args.packVersion = argv[++i] || "";
      continue;
    }
    if (token === "--cache-dir") {
      args.cacheDir = argv[++i] || "";
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const IGNORE_DIRS = new Set([".git", "node_modules", "_site", ".cache", ".specops"]);
const IGNORE_FILES = new Set([LOCK_FILENAME]);

function walkFiles(root) {
  const out = [];
  function recurse(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        recurse(full);
      } else if (entry.isFile()) {
        if (IGNORE_FILES.has(entry.name)) continue;
        const rel = path.relative(root, full).split(path.sep).join("/");
        out.push(rel);
      }
    }
  }
  if (fs.existsSync(root)) recurse(root);
  return out;
}

function diffDirs(baselineDir, candidateDir) {
  const candidateFiles = walkFiles(candidateDir);
  const added = [];
  const modified = [];
  const unchanged = [];
  for (const rel of candidateFiles) {
    const baselinePath = path.join(baselineDir, rel);
    const candidatePath = path.join(candidateDir, rel);
    if (!fs.existsSync(baselinePath)) {
      added.push(rel);
      continue;
    }
    if (hashFile(baselinePath) !== hashFile(candidatePath)) {
      modified.push(rel);
    } else {
      unchanged.push(rel);
    }
  }
  return { added, modified, unchanged };
}

function buildExpandArgs(entry, version, tmpDir, cacheDir) {
  const out = [
    "--pack-repo",
    entry.repo,
    "--pack-version",
    version,
    "--pack",
    entry.pack_id,
    "--project-dir",
    tmpDir,
  ];
  if (cacheDir) out.push("--cache-dir", cacheDir);
  for (const [key, value] of Object.entries(entry.vars || {})) {
    out.push("--var", `${key}=${value}`);
  }
  return out;
}

function printChanges(entry, version, changes) {
  const header = `── ${entry.pack_id} @ ${version}${
    version !== entry.version ? ` (current: ${entry.version})` : ""
  } ──`;
  process.stdout.write(`\n${header}\n`);
  if (changes.added.length === 0 && changes.modified.length === 0) {
    process.stdout.write("  (no changes)\n");
    return;
  }
  for (const f of changes.added) process.stdout.write(`  + ${f}\n`);
  for (const f of changes.modified) process.stdout.write(`  ~ ${f}\n`);
  process.stdout.write(
    `\n  ${changes.added.length} added · ${changes.modified.length} modified · ` +
      `${changes.unchanged.length} unchanged\n`
  );
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const projectDir = path.resolve(args.projectDir);
    const lock = readLock(projectDir);
    if (!lock) {
      error(`No .specops.lock found in ${projectDir}`);
      process.exit(1);
    }
    if (!Array.isArray(lock.packs) || lock.packs.length === 0) {
      error(".specops.lock has no pack entries.");
      process.exit(1);
    }

    let matched = 0;
    for (const entry of lock.packs) {
      if (args.pack && entry.pack_id !== args.pack) continue;
      matched += 1;

      const version = args.packVersion || entry.version;
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "specops-diff-"));
      try {
        const expandArgs = buildExpandArgs(entry, version, tmpDir, args.cacheDir);
        const result = spawnSync(process.execPath, [EXPAND_SCRIPT, ...expandArgs], {
          encoding: "utf8",
        });
        if (result.status !== 0) {
          error(`expand failed for ${entry.pack_id}:\n${result.stderr || result.stdout}`);
          continue;
        }
        const changes = diffDirs(projectDir, tmpDir);
        printChanges(entry, version, changes);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }

    if (matched === 0) {
      error(`No packs matched${args.pack ? ` --pack ${args.pack}` : ""}.`);
      process.exit(1);
    }
    info(`Diff completed for ${matched} pack(s).`);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, diffDirs, walkFiles, buildExpandArgs };
