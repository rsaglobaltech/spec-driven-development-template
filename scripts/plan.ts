#!/usr/bin/env node
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

import * as fs from "node:fs";
import * as path from "node:path";
import { resolveProjectDir } from "./lib/project-root";
import { RequirementGraph } from "./lib/requirement-graph";

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

/** Parsed command-line options for this command. */
export interface PlanOptions {
  projectDir: string;
  format: string;
}

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}📋 plan${c.reset}  ${c.dim}— what still needs implementation${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    ${c.cyan}csda plan${c.reset} [--project-dir <path>] [--json]\n\n` +
      `  ${c.bold}OPTIONS${c.reset}\n` +
      `    ${c.green}--project-dir <path>${c.reset}  ${c.dim}Project root (default: cwd).${c.reset}\n` +
      `    ${c.green}--format <text|json>${c.reset}  ${c.dim}Output format. JSON is machine-readable for AI agents.${c.reset}\n` +
      `    ${c.green}-h, --help${c.reset}            ${c.dim}Show this help.${c.reset}\n\n`
  );
}

export function parseArgs(argv) {
  const opts: PlanOptions = { projectDir: ".", format: "text" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--format" && argv[i + 1]) opts.format = argv[++i];
    else if (a === "--json") opts.format = "json";
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

export function parseTraceability(content) {
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

export function classify(row, projectDir) {
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

/**
 * Order the queue so a requirement never comes before what it builds on, and
 * mark the ones that cannot be started yet.
 *
 * `blockedBy` is the actionable half. A dependency that is already DONE
 * constrains the order and nothing else; a dependency still pending means the
 * work cannot start, and `plan` has been recommending exactly that work
 * because it had no way to know. That is defect H12.
 *
 * A project that declares no dependencies gets its rows back in matrix order
 * with two empty arrays added, which is what makes this safe to ship.
 */
export function applyDependencies(items, projectDir) {
  const ids = items.map((it) => it.requirement);
  const graph = RequirementGraph.fromProject(projectDir, ids);

  const byId: Map<string, any> = new Map(items.map((it) => [it.requirement, it]));
  const isDone = (id) => {
    const item = byId.get(id);
    return Boolean(item) && item.category === "DONE";
  };

  for (const item of items) {
    const deps = graph.dependsOn[item.requirement] || [];
    item.depends_on = deps;
    item.blocked_by = deps.filter((dep) => !isDone(dep));
  }

  // Requirements caught in a cycle cannot be ordered; they keep their place at
  // the end rather than disappearing from the queue, because a requirement the
  // plan stops mentioning is worse than one reported as tangled. `validate`
  // is where the cycle itself is reported.
  const ordered = [];
  for (const id of graph.order) {
    const item = byId.get(id);
    if (item) ordered.push(item);
  }
  for (const item of items) {
    if (!ordered.includes(item)) ordered.push(item);
  }
  return ordered;
}

function emitJson(items, projectDir, orphans) {
  const summary = items.reduce((acc, it) => {
    acc[it.category] = (acc[it.category] || 0) + 1;
    return acc;
  }, {});
  // Work that cannot start yet is not a next step. Before dependencies were
  // expressible this list happily recommended a requirement whose predecessor
  // had not been written.
  const actionable = items.filter((it) => it.category !== "DONE" && it.blocked_by.length === 0);
  const next = actionable.slice(0, 5);
  process.stdout.write(
    JSON.stringify(
      {
        schemaVersion: 1,
        projectDir: path.resolve(projectDir),
        total: items.length,
        pending: items.length - (summary.DONE || 0),
        blocked: items.filter((it) => it.category !== "DONE" && it.blocked_by.length > 0).length,
        summary,
        nextSteps: next.map((it) => ({
          requirement: it.requirement,
          category: it.category,
          hint: hintFor(it),
        })),
        requirements: items.map(toCamelRequirement),
        orphanFeatures: orphans,
        status: [],
      },
      null,
      2
    ) + "\n"
  );
}

/**
 * Rows keep snake_case internally — that is the matrix column vocabulary, and
 * every consumer inside the CLI reads it. The *contract* is camelCase
 * (ADR-0017 §4), so the rename happens here, at the emit boundary, rather than
 * rippling through the parser and every test that constructs a row.
 *
 * 0.2.0 announced this rename as breaking and applied it only to the top-level
 * keys; the nested requirements kept snake_case, which made the contract
 * document false for the one array an agent actually iterates.
 */
function toCamelRequirement(item) {
  const {
    scenario_id,
    feature_file,
    technical_artifact,
    test_artifact,
    feature_exists,
    technical_exists,
    test_exists,
    depends_on,
    blocked_by,
    ...rest
  } = item;
  return {
    ...rest,
    scenarioId: scenario_id,
    featureFile: feature_file,
    technicalArtifact: technical_artifact,
    testArtifact: test_artifact,
    featureExists: feature_exists,
    technicalExists: technical_exists,
    testExists: test_exists,
    dependsOn: depends_on || [],
    blockedBy: blocked_by || [],
  };
}

export function hintFor(item) {
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

function walkFeatures(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFeatures(full, base));
    } else if (entry.isFile() && entry.name.endsWith(".feature")) {
      out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out;
}

export function detectOrphans(projectDir, items) {
  const featuresDir = path.join(projectDir, "features");
  if (!fs.existsSync(featuresDir)) return [];
  const onDisk = walkFeatures(featuresDir).map((rel) => `features/${rel}`);
  const tracked = new Set(
    items.map((it) => (it.feature_file || "").replace(/^`|`$/g, "").trim()).filter((v) => !!v)
  );
  return onDisk.filter((rel) => !tracked.has(rel));
}

function emitText(items, orphans) {
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

  const blocked = items.filter(
    (it) => it.category !== "DONE" && it.blocked_by && it.blocked_by.length > 0
  ).length;
  const blockedNote = blocked > 0 ? `, ${blocked} blocked` : "";

  process.stdout.write(
    `\n  ${c.bold}📋 Plan${c.reset}  ${c.dim}(${total} requirement(s), ${todo} pending${blockedNote})${c.reset}\n`
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
      // A blocked requirement is listed where it belongs but marked, so the
      // reader is not sent at work whose predecessor does not exist yet.
      const blocked =
        it.blocked_by && it.blocked_by.length > 0
          ? ` ${c.yellow}⛔ blocked by ${it.blocked_by.join(", ")}${c.reset}`
          : "";
      process.stdout.write(`    ${color}${req}${c.reset}${scn}${blocked}\n`);
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

  if (orphans && orphans.length > 0) {
    process.stdout.write(
      `\n  ${c.bold}${c.red}⚠️  Orphan feature files (on disk, not in traceability.md)${c.reset}\n`
    );
    for (const f of orphans) process.stdout.write(`    ${c.red}·${c.reset} ${f}\n`);
    process.stdout.write(
      `\n  ${c.dim}Either add a row to docs/specs/traceability.md or delete the file.${c.reset}\n`
    );
  }

  if (todo === 0 && (!orphans || orphans.length === 0)) {
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
  let projectDir;
  try {
    projectDir = resolveProjectDir(opts.projectDir);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }

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
  const classified = rows.map((r) => classify(r, projectDir)).filter((x) => x !== null);
  const items = applyDependencies(classified, projectDir);
  const orphans = detectOrphans(projectDir, items);

  if (opts.format === "json") emitJson(items, projectDir, orphans);
  else emitText(items, orphans);

  process.exit(0);
}

if (require.main === module) main();
