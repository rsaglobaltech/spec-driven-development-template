#!/usr/bin/env node
"use strict";

/**
 * `pack bundle` — export a pack repository as a single-file git bundle for
 * air-gapped environments. On the disconnected side the bundle is a valid
 * clone source: `specops add --pack-repo /path/to/pack.bundle …`.
 *
 * Usage:
 *   create-spec-driven-app pack bundle --repo <url> --out <file.bundle>
 */

const { createPackBundle } = require("./domain-pack/remote");

function logInfo(msg) {
  process.stdout.write(`ℹ️ [INFO] ${msg}\n`);
}
function logError(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  create-spec-driven-app pack bundle --repo <url> --out <file.bundle>\n\n" +
      "Creates a git bundle with every branch and tag of the pack repository.\n" +
      "Copy the file into the air-gapped environment and consume it with:\n" +
      "  specops add --pack-repo /path/to/file.bundle --pack-version <tag> …\n"
  );
}

function main() {
  const argv = process.argv.slice(2);
  let repo = null;
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo" && argv[i + 1]) repo = argv[++i];
    else if (argv[i] === "--out" && argv[i + 1]) out = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      usage();
      process.exit(0);
    } else {
      logError(`Unknown argument: ${argv[i]}`);
      usage();
      process.exit(2);
    }
  }
  if (!repo || !out) {
    logError("--repo and --out are required.");
    usage();
    process.exit(2);
  }

  try {
    const result = createPackBundle({ repo, out });
    logInfo(`write ${result.out}`);
    logInfo(`refs included: ${result.refs.join(", ") || "(none)"}`);
    logInfo("✅ Bundle created. Air-gapped usage:");
    logInfo(
      `  create-spec-driven-app specops add --pack-repo ${result.out} --pack-version <tag> …`
    );
    process.exit(0);
  } catch (err) {
    logError(err && err.message ? err.message : String(err));
    process.exit(1);
  }
}

main();
