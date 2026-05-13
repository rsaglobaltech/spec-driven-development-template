#!/usr/bin/env node
"use strict";

/**
 * `plan` — list requirements that still need work, derived from
 * docs/specs/traceability.md and the project filesystem.
 *
 * For each REQ row in the traceability matrix:
 *   - Check whether the feature file exists at the listed path.
 *   - Check whether the technical artifact (production code) exists.
 *   - Check whether the test artifact exists.
 *   - Bucket the REQ into one of: NEEDS_EVERYTHING, NEEDS_FEATURE,
 *     NEEDS_TEST, NEEDS_IMPLEMENTATION, NEEDS_STATUS_UPDATE, DONE.
 *
 * Default output is human-readable text. `--format json` emits a stable
 * structure for AI agents, editors and CI dashboards.
 */

const fs = require("node:fs");
const path = require("node:path");

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
    `\n  ${c.bold}${c.cyan}📋 plan${c.reset}  ${c.dim}— what still needs implementation${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    ${c.cyan}create-spec-driven-app plan${c.reset} [--project-dir <path>] [--format <text|json>]\n\n` +
      `  ${c.bold}OPTIONS${c.reset}\n` +
      `    ${c.green}--project-dir <path>${c.reset}  ${c.dim}Project root (default: cwd).${c.reset}\n` +
      `    ${c.green}--format <text|json>${c.reset}  ${c.dim}Output format. JSON is machine-readable for AI agents.${c.reset}\n` +
      `    ${c.green}-h, --help${c.reset}            ${c.dim}Show this help.${c.reset}\n\n`
  );
}

function parseArgs(argv) {
  const opts: any = { projectDir: ".", format: "text" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--format" && argv[i + 1]) opts.format = argv[++i];
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${a}\n`);
      process.exit(2);
    }
  }
  if (!["text", "json"].includes(opts.format)) {
    process.stderr.write(`Invalid --format: ${opts.format}. Expected: text | json.\n`);
    process.exit(2);
  }
  return opts;
}

const PLACEHOLDER_RE = /^(TBD|TODO|\?+|-)?$|\{\{/;
function isMeaningful(v) {
  if (typeof v !== "string") return false;
  const stripped = v.replace(/^`|`$/g, "").trim();
  if (!stripped) return false;
  return !PLACEHOLDER_RE.test(stripped);
}

function trimCell(v) {
  return (v || "").trim();
}

function parseTraceability(content) {
  const rows = [];
  let mode = null;
  for (const raw of content.split("\n")) {
    const line = raw.trimEnd();
    if (!line.startsWith("|")) continue;
    if (line.includes("---")) continue;
    if (line.includes("| Requirement | Scenario ID |")) {
      mode = "rich";
      continue;
    }
    if (line.includes("| Feature | Scenario |")) {
      mode = "legacy";
      continue;
    }
    if (!mode) continue;
    const cells = line.split("|").map(trimCell);
    if (mode === "rich" && cells.length >= 12) {
      rows.push({
        mode,
        requirement: cells[1],
        scenarioId: cells[2],
        featureFile: cells[3],
        useCase: cells[4],
        command: cells[5],
        aggregate: cells[6],
        event: cells[7],
        technicalArtifact: cells[8],
        testArtifact: cells[9],
        status: cells[10],
      });
    } else if (mode === "legacy" && cells.length >= 6) {
      // | Feature | Scenario | Technical artifact | Status |
      // Legacy has no Requirement column → synthesise from feature file if it contains REQ-NNN.
      rows.push({
        mode,
        requirement: extractReqFromCells(cells),
        scenarioId: cells[2],
        featureFile: cells[1],
        technicalArtifact: cells[3],
        testArtifact: "",
        status: cells[4],
      });
    }
  }
  return rows;
}

function extractReqFromCells(cells) {
  for (const cell of cells) {
    const m = (cell || "").match(/REQ-\d+/);
    if (m) return m[0];
  }
  return "";
}

function fileExists(projectDir, rel) {
  if (!isMeaningful(rel)) return false;
  const clean = rel.replace(/^`|`$/g, "").trim();
  // Strip a trailing # anchor if present (e.g. "Foo.java#testBar")
  const noAnchor = clean.split("#")[0];
  return fs.existsSync(path.join(projectDir, noAnchor));
}

const DONE_STATUSES = new Set(["Implemented", "Verified", "Released"]);

function classify(row, projectDir) {
  const reqId = row.requirement || "";
  if (!/^REQ-\d+/.test(reqId)) return null;

  const featureExists = fileExists(projectDir, row.featureFile);
  const techDeclared = isMeaningful(row.technicalArtifact);
  const testDeclared = isMeaningful(row.testArtifact);
  const techExists = techDeclared && fileExists(projectDir, row.technicalArtifact);
  const testExists = testDeclared && fileExists(projectDir, row.testArtifact);
  const isDone = DONE_STATUSES.has(row.status);

  let category;
  if (!featureExists) category = "NEEDS_FEATURE";
  else if (!techDeclared && !testDeclared) category = "NEEDS_EVERYTHING";
  else if (testDeclared && !testExists && techDeclared && !techExists)
    category = "NEEDS_EVERYTHING";
  else if (testDeclared && !testExists) category = "NEEDS_TEST";
  else if (techDeclared && !techExists) category = "NEEDS_IMPLEMENTATION";
  else if (!isDone) category = "NEEDS_STATUS_UPDATE";
  else category = "DONE";

  return {
    requirement: reqId,
    scenario_id: row.scenarioId || "",
    feature_file: row.featureFile || "",
    technical_artifact: row.technicalArtifact || "",
    test_artifact: row.testArtifact || "",
    status: row.status || "",
    feature_exists: featureExists,
    technical_exists: techExists,
    test_exists: testExists,
    category,
  };
}

function emitJson(items, projectDir) {
  const summary = items.reduce((acc, it) => {
    acc[it.category] = (acc[it.category] || 0) + 1;
    return acc;
  }, {});
  const next = items.filter((it) => it.category !== "DONE").slice(0, 5);
  process.stdout.write(
    JSON.stringify(
      {
        project_dir: path.resolve(projectDir),
        total: items.length,
        pending: items.length - (summary.DONE || 0),
        summary,
        next_steps: next.map((it) => ({
          requirement: it.requirement,
          category: it.category,
          hint: hintFor(it),
        })),
        requirements: items,
      },
      null,
      2
    ) + "\n"
  );
}

function hintFor(item) {
  switch (item.category) {
    case "NEEDS_FEATURE":
      return `Create ${item.feature_file || "the .feature file declared in traceability"}.`;
    case "NEEDS_EVERYTHING":
      return `Read ${item.feature_file}, then write the test, then the production code.`;
    case "NEEDS_TEST":
      return `Read ${item.feature_file}, then create ${item.test_artifact} (TDD).`;
    case "NEEDS_IMPLEMENTATION":
      return `Test ${item.test_artifact} exists; create ${item.technical_artifact} until it passes.`;
    case "NEEDS_STATUS_UPDATE":
      return `Artifacts are in place. Run \`csda done ${item.requirement}\` to close the loop.`;
    default:
      return "";
  }
}

function emitText(items) {
  const buckets = {
    NEEDS_EVERYTHING: [],
    NEEDS_FEATURE: [],
    NEEDS_TEST: [],
    NEEDS_IMPLEMENTATION: [],
    NEEDS_STATUS_UPDATE: [],
    DONE: [],
  };
  for (const it of items) buckets[it.category].push(it);

  const total = items.length;
  const todo = total - buckets.DONE.length;

  process.stdout.write(
    `\n  ${c.bold}📋 Plan${c.reset}  ${c.dim}(${total} requirement(s), ${todo} pending)${c.reset}\n`
  );

  const groups = [
    ["NEEDS_EVERYTHING", "❌ Needs everything (no test, no code)", c.red],
    ["NEEDS_FEATURE", "❌ Feature file missing", c.red],
    ["NEEDS_TEST", "⚠️  Test missing (write the test first)", c.yellow],
    ["NEEDS_IMPLEMENTATION", "⚠️  Test exists, production code missing", c.yellow],
    ["NEEDS_STATUS_UPDATE", "⚠️  Artifacts present — run `csda done <REQ>`", c.yellow],
    ["DONE", "✅ Done", c.green],
  ];

  for (const [key, header, color] of groups) {
    const list = buckets[key];
    if (list.length === 0) continue;
    process.stdout.write(`\n  ${c.bold}${header}${c.reset}\n`);
    for (const it of list) {
      const req = it.requirement.padEnd(9);
      const scn = it.scenario_id ? ` ${c.dim}${it.scenario_id}${c.reset}` : "";
      process.stdout.write(`    ${color}${req}${c.reset}${scn}\n`);
      if (it.category === "DONE") continue;
      if (it.feature_file) {
        const mark = it.feature_exists ? "✓" : "·";
        process.stdout.write(`      ${c.dim}${mark} feature: ${it.feature_file}${c.reset}\n`);
      }
      if (isMeaningful(it.test_artifact)) {
        const mark = it.test_exists ? "✓" : "·";
        process.stdout.write(`      ${c.dim}${mark} test:    ${it.test_artifact}${c.reset}\n`);
      }
      if (isMeaningful(it.technical_artifact)) {
        const mark = it.technical_exists ? "✓" : "·";
        process.stdout.write(`      ${c.dim}${mark} code:    ${it.technical_artifact}${c.reset}\n`);
      }
    }
  }

  if (todo === 0) {
    process.stdout.write(
      `\n  ${c.green}🎉 Every requirement is implemented and marked done.${c.reset}\n\n`
    );
  } else {
    process.stdout.write(
      `\n  ${c.dim}Next: read the feature file, write the test, write the code, then run \`csda done <REQ-id>\`.${c.reset}\n\n`
    );
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const projectDir = path.resolve(opts.projectDir);

  if (!fs.existsSync(projectDir)) {
    process.stderr.write(`Project directory not found: ${projectDir}\n`);
    process.exit(2);
  }

  const tracePath = path.join(projectDir, "docs/specs/traceability.md");
  if (!fs.existsSync(tracePath)) {
    process.stderr.write(`docs/specs/traceability.md not found in ${projectDir}\n`);
    process.exit(2);
  }

  const content = fs.readFileSync(tracePath, "utf8");
  const rows = parseTraceability(content);
  const items = rows.map((r) => classify(r, projectDir)).filter((x) => x !== null);

  if (opts.format === "json") emitJson(items, projectDir);
  else emitText(items);

  process.exit(0);
}

if (require.main === module) main();

module.exports = { parseArgs, parseTraceability, classify, hintFor };
