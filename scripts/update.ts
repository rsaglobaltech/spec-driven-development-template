#!/usr/bin/env node
"use strict";

/**
 * `csda update` — regenerate the files the CLI writes into a project, without
 * discarding what the team edited.
 *
 * `agents init` and `schema fork` write files into a project. When the CLI is
 * upgraded, those files are stale: a new slash command exists, a rule changed,
 * the artefact graph gained an entry. Regenerating them plainly would clobber
 * local edits; leaving them alone means every project silently keeps the
 * version of the instructions it was scaffolded with.
 *
 * Neither is acceptable, so this does what `specops sync` already does for
 * packs: a three-way merge against a recorded baseline. The baseline is what
 * the CLI generated last time, stored in `.csda/baseline/`. Local edits win;
 * upstream changes land; genuine conflicts are marked and reported rather than
 * resolved silently.
 */

const fs = require("node:fs");
const path = require("node:path");

const { resolveProjectDir } = require("./lib/project-root");
const { error, warning, info } = require("./lib/diagnostics");
const { agentIo, wantsJson, EXIT } = require("./lib/agent");
const { threeWayMerge } = require("./specops/merge");
const { TOOLS, ALL_TOOLS } = require("./agents/init");

const BASELINE_DIR = path.join(".csda", "baseline");

const COLOR =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR ? "\x1b[0m" : "",
  bold: COLOR ? "\x1b[1m" : "",
  dim: COLOR ? "\x1b[2m" : "",
  green: COLOR ? "\x1b[32m" : "",
  yellow: COLOR ? "\x1b[33m" : "",
  red: COLOR ? "\x1b[31m" : "",
  cyan: COLOR ? "\x1b[36m" : "",
};

function readIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function baselinePath(projectDir, rel) {
  return path.join(projectDir, BASELINE_DIR, rel);
}

/**
 * Which generated files this project has. Only files that already exist are
 * updated — `update` never introduces a tool the project did not opt into.
 * Adding one is what `agents init --tool <name>` is for.
 */
function generatedFiles(projectDir) {
  const planned = new Map();
  for (const tool of ALL_TOOLS) {
    for (const file of TOOLS[tool].files()) {
      const entry = planned.get(file.path);
      if (entry) entry.tools.push(tool);
      else planned.set(file.path, { ...file, tools: [tool] });
    }
  }
  return [...planned.values()].filter((f) => fs.existsSync(path.join(projectDir, f.path)));
}

/**
 * Merge one file. Four outcomes, and the caller needs to tell them apart:
 * unchanged, updated cleanly, conflicted, or adopted (no baseline to merge
 * against, so the local file is kept and recorded as the new baseline).
 */
function updateFile(projectDir, file, opts): any {
  const target = path.join(projectDir, file.path);
  const local = readIfExists(target);
  const base = readIfExists(baselinePath(projectDir, file.path));
  const incoming = file.contents;

  if (local === incoming) {
    return { path: file.path, outcome: "unchanged" };
  }

  // No baseline: the file predates `update`, or was written by hand. Merging
  // against an empty base would report every line as a conflict, so the honest
  // move is to keep the local file and start tracking it from here.
  if (base === null) {
    if (!opts.dryRun) writeBaseline(projectDir, file.path, incoming);
    return {
      path: file.path,
      outcome: local === null ? "written" : "adopted",
      ...(local === null ? {} : { note: "no baseline — kept your version, tracking from now on" }),
    };
  }

  if (base === incoming) {
    // Upstream did not move; whatever is local is intentional.
    return { path: file.path, outcome: "unchanged" };
  }

  const { merged, conflict, conflicts } = threeWayMerge(base, local ?? "", incoming, {
    local: "local (your edits)",
    base: "base (last update)",
    incoming: "incoming (new CLI version)",
  });

  if (!opts.dryRun) {
    fs.writeFileSync(target, merged, "utf8");
    writeBaseline(projectDir, file.path, incoming);
  }

  return {
    path: file.path,
    outcome: conflict ? "conflict" : "updated",
    ...(conflict ? { conflicts } : {}),
  };
}

function writeBaseline(projectDir, rel, contents) {
  const file = baselinePath(projectDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
}

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}🔄 update${c.reset}  ${c.dim}— refresh generated files, keeping your edits${c.reset}\n\n` +
      "  USAGE\n    csda update [--project-dir <path>] [--dry-run] [--json]\n\n" +
      "  Three-way merges the files `agents init` generates against the baseline\n" +
      "  recorded in .csda/baseline/. Local edits win; upstream changes land;\n" +
      "  conflicts are marked in the file and reported, never resolved silently.\n\n" +
      "  Only files the project already has are touched. Adding a tool is\n" +
      "  `csda agents init --tool <name>`.\n\n"
  );
}

function main(argv) {
  const io = agentIo(wantsJson(argv));
  const NULL_SHAPE = { update: null };

  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(EXIT.OK);
  }

  const dryRun = argv.includes("--dry-run");
  const dirFlag = argv.indexOf("--project-dir");

  let projectDir;
  try {
    projectDir = resolveProjectDir(dirFlag !== -1 ? argv[dirFlag + 1] : ".");
  } catch (err: any) {
    io.usage(NULL_SHAPE, [
      error("project_not_found", err.message, {
        fix: "Run from inside a spec-driven project, or pass --project-dir.",
      }),
    ]);
  }

  const files = generatedFiles(projectDir);
  if (files.length === 0) {
    return io.emit(
      {
        update: { projectDir, dryRun, files: [] },
        status: [
          info("nothing_generated", "This project has no generated agent files yet.", {
            fix: "csda agents init",
          }),
        ],
      },
      () =>
        process.stdout.write(
          `\n  ${c.dim}Nothing to update — this project has no generated agent files.${c.reset}\n` +
            `  ${c.green}csda agents init${c.reset}${c.dim} writes them.${c.reset}\n\n`
        )
    );
  }

  const results = files.map((f) => updateFile(projectDir, f, { dryRun }));
  const conflicted = results.filter((r) => r.outcome === "conflict");
  const diagnostics = conflicted.map((r) =>
    warning("update_conflict", `${r.path} has ${r.conflicts} conflict(s) to resolve by hand.`, {
      file: r.path,
      fix: "Open it and resolve the <<<<<<< markers. Your version is the first block.",
    })
  );

  io.emit({ update: { projectDir, dryRun, files: results }, status: diagnostics }, () =>
    renderHuman(results, dryRun)
  );
  process.exit(EXIT.OK);
}

const MARK = {
  unchanged: `${c.dim}·${c.reset}`,
  updated: `${c.green}~${c.reset}`,
  written: `${c.green}+${c.reset}`,
  adopted: `${c.yellow}=${c.reset}`,
  conflict: `${c.red}!${c.reset}`,
};

function renderHuman(results, dryRun) {
  const counts = results.reduce((acc: any, r) => {
    acc[r.outcome] = (acc[r.outcome] || 0) + 1;
    return acc;
  }, {});

  process.stdout.write(
    `\n  ${c.bold}update${c.reset}${dryRun ? ` ${c.dim}(dry run — nothing written)${c.reset}` : ""}\n\n`
  );
  for (const r of results) {
    const note = r.note ? ` ${c.dim}— ${r.note}${c.reset}` : "";
    const conflicts = r.conflicts ? ` ${c.red}(${r.conflicts} conflict(s))${c.reset}` : "";
    process.stdout.write(`    ${MARK[r.outcome]} ${r.path}${conflicts}${note}\n`);
  }

  const summary = Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(" · ");
  process.stdout.write(`\n  ${summary}\n`);

  if (counts.conflict) {
    process.stdout.write(
      `\n  ${c.red}Resolve the <<<<<<< markers before committing.${c.reset}\n` +
        `  ${c.dim}Your version is the first block in each conflict.${c.reset}\n`
    );
  }
  process.stdout.write("\n");
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main, updateFile, generatedFiles, BASELINE_DIR };
