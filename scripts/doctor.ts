#!/usr/bin/env node

/**
 * `doctor` — one-shot environment + project health check. Each line is a
 * pass/warn/fail with a fix hint. Exits non-zero if any hard check fails, so it
 * doubles as a CI preflight.
 *
 *   csda doctor
 *   csda doctor --project-dir ./my-project
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { findProjectRoot } from "./lib/project-root";
import { parseTraceability, classify, detectOrphans } from "./plan";
import { readLock } from "./specops/lock";

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

let failures = 0;
let jsonMode = false;
const results: any[] = [];

function pass(label) {
  results.push({ status: "pass", label });
  if (!jsonMode) process.stdout.write(`  ${c.green}✔${c.reset}  ${label}\n`);
}
function warn(label, hint) {
  results.push({ status: "warn", label, hint: hint || null });
  if (!jsonMode)
    process.stdout.write(
      `  ${c.yellow}⚠${c.reset}  ${label}${hint ? ` ${c.dim}— ${hint}${c.reset}` : ""}\n`
    );
}
function failCheck(label, hint) {
  failures++;
  results.push({ status: "fail", label, hint: hint || null });
  if (!jsonMode)
    process.stdout.write(
      `  ${c.red}✖${c.reset}  ${label}${hint ? ` ${c.dim}— ${hint}${c.reset}` : ""}\n`
    );
}

function section(title, sub?) {
  if (!jsonMode)
    process.stdout.write(
      `\n  ${c.bold}${title}${c.reset}${sub ? `  ${c.dim}${sub}${c.reset}` : ""}\n`
    );
}

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}🩺 doctor${c.reset}  ${c.dim}— environment + project health check${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    ${c.cyan}csda doctor${c.reset} [--project-dir <path>]\n\n`
  );
}

function parseArgs(argv) {
  const opts: any = { projectDir: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--json" || a === "--format=json") opts.json = true;
    else if (a === "--format" && argv[i + 1] === "json") {
      i++;
      opts.json = true;
    } else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${a}\n`);
      process.exit(2);
    }
  }
  return opts;
}

function checkEnvironment() {
  section("Environment");

  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) pass(`Node.js ${process.versions.node} (≥ 20)`);
  else failCheck(`Node.js ${process.versions.node}`, "upgrade to Node ≥ 20");

  const git = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (git.status === 0) pass((git.stdout || "git").trim());
  else warn("git not found", "needed for specops remote packs and `init` git setup");
}

function checkProject(projectDir) {
  section("Project", projectDir);

  const tracePath = path.join(projectDir, "docs/specs/traceability.md");
  if (!fs.existsSync(tracePath)) {
    failCheck("traceability.md missing", "scaffold with `csda init`");
    return;
  }

  let rows;
  try {
    rows = parseTraceability(fs.readFileSync(tracePath, "utf8"));
  } catch (err: any) {
    failCheck("traceability.md does not parse", err.message);
    return;
  }
  const items = rows.map((r) => classify(r, projectDir)).filter((x) => x !== null);
  pass(`traceability.md parses (${items.length} requirement(s))`);

  const orphans = detectOrphans(projectDir, items);
  if (orphans.length === 0) pass("no orphan feature files");
  else failCheck(`${orphans.length} orphan feature file(s)`, "run `csda fix`");

  try {
    const lock = readLock(projectDir);
    if (lock && lock.packs && lock.packs.length > 0)
      pass(`.specops.lock present (${lock.packs.length} pack(s))`);
    else warn("no packs in .specops.lock", "fine if this project uses no domain packs");
  } catch (err: any) {
    failCheck(".specops.lock invalid", err.message);
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  jsonMode = opts.json;

  if (!jsonMode) process.stdout.write(`\n  ${c.bold}${c.cyan}🩺 csda doctor${c.reset}\n`);
  checkEnvironment();

  const root = opts.projectDir ? path.resolve(opts.projectDir) : findProjectRoot(process.cwd());
  const projectDetected = !!(root && fs.existsSync(root));
  if (projectDetected) {
    checkProject(root);
  } else if (!jsonMode) {
    process.stdout.write(
      `\n  ${c.dim}No spec-driven project detected here — skipping project checks.${c.reset}\n`
    );
  }

  if (jsonMode) {
    process.stdout.write(
      JSON.stringify(
        {
          schema_version: 1,
          ok: failures === 0,
          failures,
          project_dir: projectDetected ? path.resolve(root) : null,
          checks: results,
        },
        null,
        2
      ) + "\n"
    );
    process.exit(failures > 0 ? 1 : 0);
  }

  if (failures > 0) {
    process.stdout.write(`\n  ${c.red}${failures} check(s) failed.${c.reset}\n\n`);
    process.exit(1);
  }
  process.stdout.write(`\n  ${c.green}All checks passed.${c.reset}\n\n`);
  process.exit(0);
}

if (require.main === module) main();

export { parseArgs };
