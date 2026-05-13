#!/usr/bin/env node
"use strict";

/**
 * `specops sync` — re-expands every pack recorded in `.specops.lock`.
 *
 * Falls back to `specops.config.yaml` when no lockfile exists, allowing
 * fresh clones to bootstrap before the first lock is written.
 *
 * No need to re-type --pack-repo / --pack-version / --var flags: the
 * lockfile (or config) is the source of truth. Optionally bumps a single
 * pack to a new version via `--pack-version`.
 */

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { readLock } = require("./lock");
const { readConfig, configToPacks, CONFIG_FILE } = require("./config");
const { resolveProjectDir } = require("../lib/project-root");

const EXPAND_SCRIPT = path.join(__dirname, "..", "expand_domain_pack.js");

function info(msg) {
  process.stdout.write(`ℹ️ [INFO] ${msg}\n`);
}
function error(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  create-spec-driven-app specops sync [--project-dir <path>] [--pack <pack-id>] [--pack-version <tag>] [--cache-dir <path>] [--dry-run]\n\n" +
      "Re-expands packs recorded in .specops.lock (or specops.config.yaml if no\n" +
      "lockfile exists). With --pack-version, bumps the matching pack(s) to a\n" +
      "new tag/SHA and updates the lockfile.\n"
  );
}

function parseArgs(argv) {
  const args = {
    projectDir: ".",
    pack: "",
    packVersion: "",
    cacheDir: "",
    dryRun: false,
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
    if (token === "--dry-run") {
      args.dryRun = true;
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

function buildExpandArgs(entry, version, projectDir, cacheDir, dryRun) {
  const out = [
    "--pack-repo",
    entry.repo,
    "--pack-version",
    version,
    "--pack",
    entry.pack_id,
    "--project-dir",
    projectDir,
  ];
  if (cacheDir) {
    out.push("--cache-dir", cacheDir);
  }
  for (const [key, value] of Object.entries(entry.vars || {})) {
    out.push("--var", `${key}=${value}`);
  }
  if (dryRun) out.push("--dry-run");
  return out;
}

function resolvePacks(projectDir) {
  const lock = readLock(projectDir);
  if (lock) {
    if (!Array.isArray(lock.packs) || lock.packs.length === 0) {
      throw new Error(".specops.lock has no pack entries.");
    }
    return { packs: lock.packs, source: ".specops.lock" };
  }

  const config = readConfig(projectDir);
  if (config) {
    return { packs: configToPacks(config), source: CONFIG_FILE };
  }

  throw new Error(
    `No .specops.lock or ${CONFIG_FILE} found in ${projectDir}.\n` +
      `Run 'expand --pack-repo ...' first, or create a ${CONFIG_FILE}.`
  );
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const projectDir = resolveProjectDir(args.projectDir);
    const { packs, source } = resolvePacks(projectDir);

    info(`Reading pack list from ${source}`);

    let matched = 0;
    for (const entry of packs) {
      if (args.pack && entry.pack_id !== args.pack) continue;
      matched += 1;

      const version = args.packVersion || entry.version;
      const bumping = args.packVersion && args.packVersion !== entry.version;
      info(`Syncing ${entry.pack_id} @ ${version}` + (bumping ? ` (was ${entry.version})` : ""));

      const expandArgs = buildExpandArgs(entry, version, projectDir, args.cacheDir, args.dryRun);
      const result = spawnSync(process.execPath, [EXPAND_SCRIPT, ...expandArgs], {
        stdio: "inherit",
      });
      if (result.status !== 0) {
        error(`expand failed for ${entry.pack_id} (exit ${result.status})`);
        process.exit(result.status || 1);
      }
    }

    if (matched === 0) {
      error(`No packs matched${args.pack ? ` --pack ${args.pack}` : ""}.`);
      process.exit(1);
    }
    info(`Sync completed for ${matched} pack(s).`);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, buildExpandArgs, resolvePacks };
