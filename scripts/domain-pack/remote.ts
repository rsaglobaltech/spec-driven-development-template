"use strict";

/**
 * Resolves a remote pack repository to a local on-disk path.
 *
 * Behaviour:
 *   resolveRemotePack({ repo, version, cacheDir? })
 *     → { packRoot: <local-dir>, commit: <sha>, version: <ref-as-provided> }
 *
 * Caching:
 *   ~/.cache/csda/packs/<repo-hash>/<version>/
 *   The cache key is sha256(repo) so different repos with the same tag
 *   never collide. `cacheDir` can be overridden (used by tests).
 *
 * Side effects: spawns `git` and writes inside the cache directory.
 * Throws on any failure with a contextual message.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const DEFAULT_CACHE_DIR = path.join(os.homedir(), ".cache", "csda", "packs");
const GIT_TIMEOUT_MS = 60_000;

function repoHash(repo) {
  return crypto.createHash("sha256").update(String(repo)).digest("hex").slice(0, 16);
}

function safeVersionDir(version) {
  return String(version).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function runGit(args, options: any = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    timeout: options.timeout || GIT_TIMEOUT_MS,
    cwd: options.cwd,
  });
  if (result.error) {
    throw new Error(`git ${args[0]} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    throw new Error(`git ${args[0]} exited ${result.status}: ${stderr || "unknown error"}`);
  }
  return (result.stdout || "").trim();
}

function gitAvailable() {
  const result = spawnSync("git", ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

/**
 * @param {{ repo: string, version: string, cacheDir?: string, force?: boolean }} options
 * @returns {{ packRoot: string, commit: string, version: string, cached: boolean }}
 */
function resolveRemotePack(options) {
  const opts = options || {};
  if (!opts.repo) throw new Error("resolveRemotePack: 'repo' is required");
  if (!opts.version) throw new Error("resolveRemotePack: 'version' is required");
  if (!gitAvailable()) throw new Error("resolveRemotePack: 'git' is not available on PATH");

  const cacheRoot = opts.cacheDir || DEFAULT_CACHE_DIR;
  const targetDir = path.join(cacheRoot, repoHash(opts.repo), safeVersionDir(opts.version));

  const cached = fs.existsSync(path.join(targetDir, ".git"));
  if (cached && !opts.force) {
    const commit = runGit(["rev-parse", "HEAD"], { cwd: targetDir });
    return { packRoot: targetDir, commit, version: opts.version, cached: true };
  }

  if (cached && opts.force) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  // Shallow clone with the specific ref. Works for tags and branches.
  // Falls back to a full clone + checkout when --branch fails (e.g. for SHAs).
  try {
    runGit(["clone", "--depth", "1", "--branch", opts.version, opts.repo, targetDir]);
  } catch {
    // Either the ref is a SHA or shallow-with-branch isn't supported.
    fs.rmSync(targetDir, { recursive: true, force: true });
    runGit(["clone", opts.repo, targetDir]);
    runGit(["checkout", "--detach", opts.version], { cwd: targetDir });
  }

  const commit = runGit(["rev-parse", "HEAD"], { cwd: targetDir });
  return { packRoot: targetDir, commit, version: opts.version, cached: false };
}

module.exports = {
  resolveRemotePack,
  repoHash,
  safeVersionDir,
  gitAvailable,
  DEFAULT_CACHE_DIR,
};
