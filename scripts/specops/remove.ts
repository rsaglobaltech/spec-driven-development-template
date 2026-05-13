#!/usr/bin/env node
"use strict";

/**
 * `specops remove <pack-id>` — drop a pack entry from `.specops.lock`.
 *
 * By design this DOES NOT delete generated files (would be too easy to
 * destroy hand-edited tests). Run `csda specops sync` afterwards if you
 * want to regenerate the rest of the lockfile without the removed pack.
 *
 *   csda specops remove parking-management/backend
 */

const { resolveProjectDir } = require("../lib/project-root");
const { readLock, writeLock, LOCK_FILENAME } = require("./lock");

const COLOR_ENABLED =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR_ENABLED ? "\x1b[0m" : "",
  bold: COLOR_ENABLED ? "\x1b[1m" : "",
  dim: COLOR_ENABLED ? "\x1b[2m" : "",
  red: COLOR_ENABLED ? "\x1b[31m" : "",
  green: COLOR_ENABLED ? "\x1b[32m" : "",
  yellow: COLOR_ENABLED ? "\x1b[33m" : "",
  cyan: COLOR_ENABLED ? "\x1b[36m" : "",
};

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}➖ specops remove${c.reset}  ${c.dim}— drop a pack from .specops.lock${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    ${c.cyan}csda specops remove${c.reset} <pack-id> [--project-dir <path>] [--dry-run]\n\n` +
      `  ${c.bold}OPTIONS${c.reset}\n` +
      `    ${c.green}--project-dir <path>${c.reset}  ${c.dim}Project root (auto-detected from cwd if omitted).${c.reset}\n` +
      `    ${c.green}--dry-run${c.reset}             ${c.dim}Show what would be removed; touch nothing.${c.reset}\n` +
      `    ${c.green}-h, --help${c.reset}            ${c.dim}Show this help.${c.reset}\n\n` +
      `  ${c.bold}NOTES${c.reset}\n` +
      `    ${c.dim}Generated files are NOT deleted automatically — review with \`git status\` and remove anything you no longer want.${c.reset}\n\n`
  );
}

function parseArgs(argv) {
  const opts: any = { packId: null, projectDir: ".", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${a}\n`);
      process.exit(2);
    } else if (!opts.packId) {
      opts.packId = a;
    } else {
      process.stderr.write(`Unexpected positional argument: ${a}\n`);
      process.exit(2);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.packId) {
    process.stderr.write(
      `${c.red}✖${c.reset}  pack-id is required (e.g. parking-management/backend).\n`
    );
    usage();
    process.exit(2);
  }

  let projectDir;
  try {
    projectDir = resolveProjectDir(opts.projectDir, { requireSentinel: true });
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }

  const lock = readLock(projectDir);
  if (!lock) {
    process.stderr.write(
      `${c.red}✖${c.reset}  No ${LOCK_FILENAME} in ${projectDir}. Nothing to remove.\n`
    );
    process.exit(1);
  }

  const before = lock.packs.length;
  const remaining = lock.packs.filter((p) => p.pack_id !== opts.packId);
  if (remaining.length === before) {
    process.stderr.write(`${c.red}✖${c.reset}  ${opts.packId} not found in ${LOCK_FILENAME}.\n`);
    process.exit(1);
  }

  if (opts.dryRun) {
    process.stdout.write(
      `${c.yellow}…${c.reset}  [dry-run] would remove ${c.bold}${opts.packId}${c.reset} from ${LOCK_FILENAME} (${before - remaining.length} entry).\n`
    );
    process.exit(0);
  }

  const next = { ...lock, packs: remaining };
  writeLock(projectDir, next);
  process.stdout.write(
    `${c.green}✔${c.reset}  Removed ${c.bold}${opts.packId}${c.reset} from ${LOCK_FILENAME} (${
      before - remaining.length
    } entry).\n` +
      `${c.dim}   Generated files were not deleted. Inspect with \`git status\` and remove anything unwanted.${c.reset}\n`
  );
  process.exit(0);
}

if (require.main === module) main();

module.exports = { parseArgs };
