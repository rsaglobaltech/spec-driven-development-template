#!/usr/bin/env node
"use strict";

/**
 * `csda init --from-pack <repo>@<tag> --pack <id>` — scaffold and install a
 * domain pack in one step.
 *
 * This is sugar over `init` followed by `specops add`, and that is the point.
 * The two-command form is what a team runs on every new service in a
 * multi-repo estate, and getting it wrong — forgetting the pack, pinning the
 * wrong tag — is how repositories drift apart. One command with one pinned
 * reference is the answer to multi-repo that does not require inventing a
 * central store: the pack *is* the shared source of truth, and it is already
 * versioned.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { error } = require("./lib/diagnostics");
const { agentIo, wantsJson, EXIT } = require("./lib/agent");

const CLI = path.join(__dirname, "..", "bin", "create-spec-driven-app.js");

/** `https://host/org/repo.git@v1.2.3` → { repo, version }. */
function parseReference(reference) {
  // Split on the last @ so an scp-style git URL (git@host:org/repo.git@tag)
  // still parses — the first @ belongs to the user, not the version.
  const at = reference.lastIndexOf("@");
  if (at <= 0) return { repo: reference, version: null };
  return { repo: reference.slice(0, at), version: reference.slice(at + 1) };
}

function run(args, cwd?) {
  return spawnSync(process.execPath, [CLI, ...args], {
    stdio: "inherit",
    cwd: cwd || process.cwd(),
    encoding: "utf8",
  });
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  csda init --from-pack <repo>@<tag> --pack <pack-id> [--config <path>] [--out <dir>]\n\n" +
      "Scaffolds the project and installs the pack in one step, pinned to the tag.\n" +
      "Every other `init` flag is passed through.\n\n" +
      "Example:\n" +
      "  csda init --from-pack https://github.com/acme/parking-specops.git@v0.2.0 \\\n" +
      "    --pack backend --config ./project.yaml --out ./services\n"
  );
}

function main(argv) {
  const io = agentIo(wantsJson(argv));
  const NULL_SHAPE = { project: null };

  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(EXIT.OK);
  }

  // Split our flags from the ones `init` owns.
  const initArgs = [];
  let reference = null;
  let packId = null;
  let outDir = ".";
  const vars = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from-pack" && argv[i + 1]) reference = argv[++i];
    else if (a === "--pack" && argv[i + 1]) packId = argv[++i];
    else if (a === "--var" && argv[i + 1]) {
      // --var belongs to the pack, not to init: init reads its values from the
      // config file or the wizard, and rejects the flag outright.
      vars.push("--var", argv[++i]);
    } else {
      if (a === "--out" && argv[i + 1]) outDir = argv[i + 1];
      initArgs.push(a);
    }
  }

  const { repo, version } = parseReference(reference || "");

  if (!reference) {
    io.usage(NULL_SHAPE, [
      error("from_pack_required", "--from-pack needs a <repo>@<tag> reference.", {
        fix: "csda init --from-pack https://github.com/acme/specops.git@v0.1.0 --pack backend",
      }),
    ]);
  }
  if (!version) {
    // An unpinned pack is the thing this command exists to prevent: two repos
    // scaffolded a week apart would silently get different requirements.
    io.usage(NULL_SHAPE, [
      error("from_pack_unpinned", `No tag in "${reference}".`, {
        target: reference,
        fix: "Pin it: --from-pack <repo>@<tag>. An unpinned pack means two repos scaffolded a week apart get different specs.",
      }),
    ]);
  }
  if (!packId) {
    io.usage(NULL_SHAPE, [
      error("pack_id_required", "--pack names which pack inside the repo to install.", {
        fix: "Add --pack backend (or whichever id the pack repo declares).",
      }),
    ]);
  }

  // The pack supplies the real requirements, so suppress the starter one.
  // Without this the project ends up with the scaffold's health requirement
  // sitting next to the pack's own — two requirements for the same thing.
  const init = run(["init", "--no-sample-req", ...initArgs]);
  if (init.status !== 0) {
    io.fail(NULL_SHAPE, [
      error("init_failed", "Scaffolding failed; the pack was not installed.", {
        fix: "Fix what `csda init` reported, then re-run.",
      }),
    ]);
  }

  // `init` writes into <out>/<slug>; find it rather than guessing, because the
  // slug comes from the config or the wizard.
  const projectDir = newestProjectIn(outDir);
  if (!projectDir) {
    io.fail(NULL_SHAPE, [
      error("project_dir_not_found", `Could not find the project init created under ${outDir}.`, {
        fix: "Install the pack yourself: csda specops add --pack-repo … --pack-version … --pack …",
      }),
    ]);
  }

  const add = run([
    "specops",
    "add",
    "--pack-repo",
    repo,
    "--pack-version",
    version,
    "--pack",
    packId,
    "--project-dir",
    projectDir,
    ...vars,
  ]);

  if (add.status !== 0) {
    io.fail({ project: { dir: projectDir, pack: null } }, [
      error("pack_install_failed", "The project was created but the pack was not installed.", {
        target: `${repo}@${version}`,
        fix: `Re-run just the install: csda specops add --pack-repo ${repo} --pack-version ${version} --pack ${packId} --project-dir ${projectDir}`,
      }),
    ]);
  }

  io.emit({ project: { dir: projectDir, pack: { repo, version, id: packId } } }, () =>
    process.stdout.write(
      `\n  ✔  ${path.basename(projectDir)} scaffolded with ${packId} @ ${version}\n` +
        `     Next: csda validate ${projectDir}\n\n`
    )
  );
  process.exit(EXIT.OK);
}

/** The most recently created directory under `outDir` that looks spec-driven. */
function newestProjectIn(outDir) {
  let best = null;
  let bestTime = -1;
  let entries;
  try {
    entries = fs.readdirSync(outDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(outDir, entry.name);
    if (!fs.existsSync(path.join(dir, "spec.md"))) continue;
    const mtime = fs.statSync(dir).mtimeMs;
    if (mtime > bestTime) {
      bestTime = mtime;
      best = dir;
    }
  }
  return best;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main, parseReference, newestProjectIn };
