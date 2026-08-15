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
const { resolveProjectDir } = require("../lib/project-root");
const { resolveRemotePack } = require("../domain-pack/remote");
const { deriveDelta, materialiseChange } = require("./as_change");

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
      "  create-spec-driven-app specops diff [--project-dir <path>] [--pack <pack-id>] [--pack-version <tag>] [--cache-dir <path>] [--var KEY=VALUE]... [--format text|json] [--plan]\n\n" +
      "Reports files that would be added or modified if `specops sync` ran at\n" +
      "the chosen version. Writes nothing to the project directory.\n\n" +
      "  --as-change       Derive the bump as a reviewable change: compares the\n" +
      "                    packs' requirement models and writes a change folder\n" +
      "                    with a proposal and delta specs. Add --dry-run to see\n" +
      "                    the summary without writing it.\n" +
      "  --var KEY=VALUE   Extra template variable (repeatable). Use it when a\n" +
      "                    newer pack version requires a variable the lockfile\n" +
      "                    predates.\n" +
      "With --format json (or its alias --plan), emits a machine-readable\n" +
      "structure suitable for AI agents and editor integrations.\n"
  );
}

function parseArgs(argv) {
  const args = {
    projectDir: ".",
    pack: "",
    packVersion: "",
    cacheDir: "",
    format: "text",
    asChange: false,
    dryRun: false,
    vars: {} as Record<string, string>,
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
    if (token === "--var") {
      const pair = argv[++i] || "";
      const eq = pair.indexOf("=");
      if (eq <= 0) throw new Error(`Invalid --var (expected KEY=VALUE): ${pair}`);
      args.vars[pair.slice(0, eq)] = pair.slice(eq + 1);
      continue;
    }
    if (token === "--format") {
      args.format = argv[++i] || "";
      continue;
    }
    if (token === "--plan") {
      args.format = "json";
      continue;
    }
    if (token === "--as-change") {
      args.asChange = true;
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
  if (!["text", "json"].includes(args.format)) {
    throw new Error(`Invalid --format: ${args.format}. Expected: text | json.`);
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

function buildExpandArgs(entry, version, tmpDir, cacheDir, extraVars = {}) {
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
  // CLI --var values extend/override the lockfile's recorded vars — needed
  // when a newer pack version requires a variable the lockfile predates.
  const vars = { ...(entry.vars || {}), ...extraVars };
  for (const [key, value] of Object.entries(vars)) {
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

/**
 * `--as-change`: resolve the pack at both versions, compare their requirement
 * models, and write the difference as a change folder.
 *
 * Both sides come from `pack.yaml`, never from a rendered tree — a pack that
 * only reformats templates yields no deltas, which is the property that makes
 * this more useful than the file diff rather than noisier than it.
 */
function runAsChange(args, projectDir, lock) {
  const results = [];
  let matched = 0;

  for (const entry of lock.packs) {
    if (args.pack && entry.pack_id !== args.pack) continue;
    matched += 1;

    const targetVersion = args.packVersion || entry.version;
    if (!entry.repo) {
      throw new Error(
        `Pack "${entry.pack_id}" has no repo in .specops.lock; --as-change needs a versioned pack repository.`
      );
    }

    const current = resolveRemotePack({
      repo: entry.repo,
      version: entry.version,
      cacheDir: args.cacheDir || undefined,
    });
    const target =
      targetVersion === entry.version
        ? current
        : resolveRemotePack({
            repo: entry.repo,
            version: targetVersion,
            cacheDir: args.cacheDir || undefined,
          });

    const derived = deriveDelta(current.packRoot, target.packRoot, entry.pack_id);

    if (!derived.markdown) {
      results.push({
        pack_id: entry.pack_id,
        current_version: entry.version,
        target_version: targetVersion,
        change: null,
        summary: derived.summary,
        message: "No requirement changed; nothing to review.",
      });
      continue;
    }

    const written = materialiseChange(projectDir, entry, targetVersion, derived, {
      dryRun: args.dryRun,
    });
    results.push({
      pack_id: entry.pack_id,
      current_version: entry.version,
      target_version: targetVersion,
      change: written.changeId,
      files: written.files,
      summary: derived.summary,
      dryRun: args.dryRun === true,
    });
  }

  if (matched === 0) {
    throw new Error(`No packs matched${args.pack ? ` --pack ${args.pack}` : ""}.`);
  }

  if (args.format === "json") {
    process.stdout.write(
      JSON.stringify({ project_dir: projectDir, changes: results }, null, 2) + "\n"
    );
    return;
  }

  for (const r of results) {
    const header = `── ${r.pack_id} @ ${r.target_version}${
      r.target_version !== r.current_version ? ` (current: ${r.current_version})` : ""
    } ──`;
    process.stdout.write(`\n${header}\n`);
    if (!r.change) {
      process.stdout.write(`  ${r.message}\n`);
      continue;
    }
    for (const id of r.summary.added) process.stdout.write(`  + ${id}\n`);
    for (const id of r.summary.modified) process.stdout.write(`  ~ ${id}\n`);
    for (const id of r.summary.removed) process.stdout.write(`  - ${id}\n`);
    process.stdout.write(
      `\n  ${r.summary.added.length} added · ${r.summary.modified.length} modified · ` +
        `${r.summary.removed.length} removed\n`
    );
    if (r.dryRun) {
      process.stdout.write(`\n  Would create change '${r.change}' (dry run — nothing written).\n`);
    } else {
      process.stdout.write(`\n  Change '${r.change}' created:\n`);
      for (const f of r.files) process.stdout.write(`    + ${f}\n`);
      process.stdout.write(`\n  Review it, then: csda change validate ${r.change}\n`);
    }
  }
  process.stdout.write("\n");
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const projectDir = resolveProjectDir(args.projectDir);
    const lock = readLock(projectDir);
    if (!lock) {
      error(`No .specops.lock found in ${projectDir}`);
      process.exit(1);
    }
    if (!Array.isArray(lock.packs) || lock.packs.length === 0) {
      error(".specops.lock has no pack entries.");
      process.exit(1);
    }

    if (args.asChange) {
      runAsChange(args, projectDir, lock);
      return;
    }

    const jsonOut = {
      project_dir: projectDir,
      diffs: [] as any[],
    };
    let matched = 0;
    for (const entry of lock.packs) {
      if (args.pack && entry.pack_id !== args.pack) continue;
      matched += 1;

      const version = args.packVersion || entry.version;
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "specops-diff-"));
      try {
        const expandArgs = buildExpandArgs(entry, version, tmpDir, args.cacheDir, args.vars);
        const result = spawnSync(process.execPath, [EXPAND_SCRIPT, ...expandArgs], {
          encoding: "utf8",
        });
        if (result.status !== 0) {
          if (args.format === "json") {
            jsonOut.diffs.push({
              pack_id: entry.pack_id,
              current_version: entry.version,
              target_version: version,
              error: result.stderr || result.stdout || "expand failed",
            });
          } else {
            error(`expand failed for ${entry.pack_id}:\n${result.stderr || result.stdout}`);
          }
          continue;
        }
        const changes = diffDirs(projectDir, tmpDir);
        if (args.format === "json") {
          jsonOut.diffs.push({
            pack_id: entry.pack_id,
            current_version: entry.version,
            target_version: version,
            added: changes.added,
            modified: changes.modified,
            unchanged_count: changes.unchanged.length,
          });
        } else {
          printChanges(entry, version, changes);
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }

    if (matched === 0) {
      error(`No packs matched${args.pack ? ` --pack ${args.pack}` : ""}.`);
      process.exit(1);
    }

    if (args.format === "json") {
      process.stdout.write(JSON.stringify(jsonOut, null, 2) + "\n");
    } else {
      info(`Diff completed for ${matched} pack(s).`);
    }
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, diffDirs, walkFiles, buildExpandArgs, runAsChange };
