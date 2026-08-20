#!/usr/bin/env node

/**
 * `fix` — auto-repair the mechanical traceability violations that `validate`
 * reports, so a dev never edits the matrix by hand to clear them:
 *
 *   - Orphan .feature files (on disk, not in the matrix) → append a row.
 *   - REQ-NNN found in spec.md with no matrix row → append a row.
 *
 * Prints the planned changes first; applies only with --yes or an interactive
 * "y" confirmation. Non-TTY without --yes aborts (safe for CI).
 *
 *   csda fix              # preview + confirm
 *   csda fix --yes        # apply unattended
 *   csda fix --dry-run    # preview only, never write
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { resolveProjectDir } from "./lib/project-root";
import { parseTraceability, detectOrphans } from "./plan";
import { agentIo, wantsJson } from "./lib/agent";
import { error, errorMessage } from "./lib/diagnostics";
import { appendRequirement } from "./req";

/**
 * The document shape when `fix` cannot do its job. Emitted with the same keys
 * as success so an agent never has to distinguish "failed" from "printed
 * nothing" (ADR-0017).
 */
const NULL_SHAPE = { projectDir: null, actions: [], applied: false, dryRun: false };

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
    `\n  ${c.bold}${c.cyan}🛠  fix${c.reset}  ${c.dim}— auto-repair mechanical traceability violations${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    ${c.cyan}csda fix${c.reset} [--yes] [--dry-run] [--json] [--project-dir <path>]\n\n` +
      `  ${c.bold}OPTIONS${c.reset}\n` +
      `    ${c.green}--yes${c.reset}                ${c.dim}Apply without prompting (CI-friendly).${c.reset}\n` +
      `    ${c.green}--dry-run${c.reset}            ${c.dim}Preview the changes; never write.${c.reset}\n` +
      `    ${c.green}--json${c.reset}               ${c.dim}Machine-readable output. Needs --yes or --dry-run.${c.reset}\n` +
      `    ${c.green}--project-dir <path>${c.reset} ${c.dim}Project root (auto-detected from cwd if omitted).${c.reset}\n` +
      `    ${c.green}-h, --help${c.reset}           ${c.dim}Show this help.${c.reset}\n\n`
  );
}

/**
 * Compute the set of repairs for a project. Pure-ish: reads the filesystem to
 * detect orphans/spec REQs, but does not write. Returns the new traceability
 * content plus a human-readable list of actions.
 */
function computeFixes(projectDir, traceContent, specContent) {
  const rows = parseTraceability(traceContent);
  const items = rows.map((r) => ({ feature_file: r.featureFile, requirement: r.requirement }));

  const actions: string[] = [];
  let content = traceContent;

  // 1. Orphan feature files → append a row that references each.
  const orphans = detectOrphans(projectDir, items);
  for (const rel of orphans) {
    const res = appendRequirement(content, {
      featureFile: rel,
      useCase: `TODO: describe ${path.basename(rel, ".feature")}`,
    });
    content = res.content;
    actions.push(`+ row for orphan feature ${rel} → ${res.reqId}`);
  }

  // 2. REQ-NNN in spec.md with no row → append a placeholder row.
  const known = new Set(
    parseTraceability(content)
      .map((r) => r.requirement)
      .filter(Boolean)
  );
  const specReqs = new Set<string>(specContent.match(/\bREQ-\d+\b/g) || []);
  for (const reqId of specReqs) {
    if (known.has(reqId)) continue;
    const res = appendRequirement(content, {
      requirement: reqId,
      useCase: "TODO: describe this requirement",
    });
    content = res.content;
    known.add(reqId);
    actions.push(`+ row for ${reqId} (in spec.md, missing from matrix)`);
  }

  return { content, actions };
}

/** Parsed command-line options for this command. */
export interface FixOptions {
  projectDir: string;
  yes: boolean;
  dryRun: boolean;
  json: boolean;
}

function parseArgs(argv) {
  const opts: FixOptions = { projectDir: ".", yes: false, dryRun: false, json: wantsJson(argv) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes" || a === "-y") opts.yes = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--json") continue;
    else if (a === "--format" && argv[i + 1] === "json") i++;
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${a}\n`);
      process.exit(2);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const io = agentIo(opts.json);

  let projectDir;
  try {
    projectDir = resolveProjectDir(opts.projectDir);
  } catch (err) {
    io.usage(NULL_SHAPE, [
      error("no_project", errorMessage(err), {
        fix: "Run from inside a spec-driven project, or pass --project-dir <path>.",
      }),
    ]);
    return;
  }

  const tracePath = path.join(projectDir, "docs/specs/traceability.md");
  if (!fs.existsSync(tracePath)) {
    io.usage(NULL_SHAPE, [
      error("no_traceability_matrix", `docs/specs/traceability.md not found in ${projectDir}`, {
        target: tracePath,
        fix: "Run `csda adopt` to install the spec skeleton, or `csda init` for a new project.",
      }),
    ]);
    return;
  }
  const specPath = path.join(projectDir, "spec.md");
  const specContent = fs.existsSync(specPath) ? fs.readFileSync(specPath, "utf8") : "";

  const traceContent = fs.readFileSync(tracePath, "utf8");
  const { content, actions } = computeFixes(projectDir, traceContent, specContent);

  const base = { projectDir, actions, dryRun: Boolean(opts.dryRun) };

  if (actions.length === 0) {
    io.emit({ ...base, applied: false }, () =>
      process.stdout.write(
        `${c.green}✔${c.reset}  Nothing to fix — the matrix is already consistent.\n`
      )
    );
    process.exit(0);
  }

  if (!io.json) {
    process.stdout.write(
      `\n  ${c.bold}Planned fixes${c.reset} ${c.dim}(${actions.length})${c.reset}\n`
    );
    for (const a of actions) process.stdout.write(`    ${c.green}${a}${c.reset}\n`);
    process.stdout.write("\n");
  }

  if (opts.dryRun) {
    io.emit({ ...base, applied: false }, () =>
      process.stdout.write(`${c.dim}--dry-run: no changes written.${c.reset}\n`)
    );
    process.exit(0);
  }

  if (!opts.yes) {
    // JSON mode has no one to ask. Prompting would hang an agent that is
    // reading stdout and never writing to stdin, so it is a usage error with
    // the flag that resolves it.
    if (io.json) {
      io.usage({ ...NULL_SHAPE, projectDir, actions, dryRun: false }, [
        error("confirmation_required", "Refusing to write without confirmation.", {
          fix: "Re-run with --yes to apply unattended, or --dry-run to preview.",
        }),
      ]);
      return;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stderr.write(
        `${c.red}✖${c.reset}  Refusing to write without confirmation. Re-run with --yes (or --dry-run to preview).\n`
      );
      process.exit(2);
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`  Apply these ${actions.length} fix(es)? [y/N] `))
      .trim()
      .toLowerCase();
    rl.close();
    if (answer !== "y" && answer !== "yes") {
      process.stdout.write(`${c.dim}Aborted; no changes written.${c.reset}\n`);
      process.exit(1);
    }
  }

  fs.writeFileSync(tracePath, content, "utf8");
  io.emit({ ...base, applied: true }, () =>
    process.stdout.write(
      `${c.green}✔${c.reset}  Applied ${actions.length} fix(es) to docs/specs/traceability.md\n` +
        `   ${c.dim}Next: replace the TODO cells, then \`csda validate --strict-tdd\`.${c.reset}\n`
    )
  );
  process.exit(0);
}

if (require.main === module) main();

export { computeFixes, parseArgs };
