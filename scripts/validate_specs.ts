#!/usr/bin/env node
"use strict";

/**
 * Node.js port of validate_specs.sh — same checks, same exit codes.
 * Usage:
 *   node scripts/validate_specs.js <project_dir> [--strict-tdd]
 */

const fs = require("node:fs");
const path = require("node:path");

function logInfo(msg) {
  process.stdout.write(`ℹ️ [INFO] ${msg}\n`);
}
function logError(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "🔎 Usage:\n" +
      "  validate_specs.js <project_dir> [--strict-tdd]\n\n" +
      "Checks:\n" +
      "- minimum SDD structure\n" +
      "- required files\n" +
      "- at least one .feature file\n" +
      "- unresolved placeholders ({{...}})\n" +
      "- feature coverage in traceability.md\n" +
      "- allowed status values in traceability.md\n" +
      "- expected DDD Lite document headers when present\n\n" +
      "--strict-tdd additionally enforces:\n" +
      "- No 'Test Artifact = TBD' when Status is In Dev or later\n" +
      "- Every requirement has at least one traceability row\n" +
      "- Every scenario row has a non-empty Scenario ID\n"
  );
}

function logFix(lines) {
  for (const line of Array.isArray(lines) ? lines : [lines]) {
    process.stderr.write(`💡 [FIX] ${line}\n`);
  }
}

function fail(msg, exitCode = 1, fix = null) {
  logError(msg);
  if (fix) logFix(fix);
  process.exit(exitCode);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function findRecursive(rootDir, predicate) {
  return walk(rootDir).filter(predicate);
}

const REQUIRED_FILES = [
  "spec.md",
  "AI_RULES.md",
  "README.md",
  "docs/specs/traceability.md",
  "docs/specs/adr/README.md",
];

const REQUIRED_DIRS = ["features", "docs/specs"];

const ALLOWED_STATUS = new Set([
  "Draft",
  "Needs Clarification",
  "Domain Reviewed",
  "Architecture Reviewed",
  "Ready for Dev",
  "Approved",
  "In Dev",
  "In Review",
  "Implemented",
  "Verified",
  "Released",
  "Deprecated",
]);

// Statuses that are "past Draft" — test artifacts must be defined by these.
const POST_DRAFT_STATUS = new Set([
  "Needs Clarification",
  "Domain Reviewed",
  "Architecture Reviewed",
  "Ready for Dev",
  "Approved",
  "In Dev",
  "In Review",
  "Implemented",
  "Verified",
  "Released",
  "Deprecated",
]);

const RICH_HEADER =
  "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |";
const LEGACY_HEADER = "| Feature | Scenario | Technical artifact | Status |";
const PLACEHOLDER_RE = /\{\{[A-Z_][A-Z0-9_]*\}\}/;

function trimCell(s) {
  return (s || "").trim();
}

/**
 * Parse the traceability matrix rows from a markdown table.
 * Returns an array of cell arrays (strings already trimmed).
 */
function parseMatrixRows(content, traceMode) {
  const rows = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.startsWith("|")) continue;
    if (line.includes("---")) continue;
    if (line.includes("| Requirement | Scenario ID |")) continue;
    if (line.includes("| Feature | Scenario |")) continue;
    const cells = line.split("|").map(trimCell);
    rows.push({ cells, traceMode });
  }
  return rows;
}

function main() {
  const argv = process.argv.slice(2);
  const strictTdd = argv.includes("--strict-tdd");
  const positional = argv.filter((a) => !a.startsWith("-"));

  const targetDir = positional[0];
  if (!targetDir) {
    usage();
    process.exit(2);
  }
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    fail(`Directory not found: ${targetDir}`, 2, [
      "Check the path for typos, or scaffold a new project first:",
      "  create-spec-driven-app init",
    ]);
  }

  // Required directories
  for (const d of REQUIRED_DIRS) {
    if (!fs.existsSync(path.join(targetDir, d))) {
      fail(`Missing required directory: ${d}`, 1, [
        `Create it: mkdir -p ${d}`,
        "Or scaffold the full SDD structure with `create-spec-driven-app init` / `specops add`.",
      ]);
    }
  }

  // Required files
  const FILE_FIXES = {
    "spec.md":
      "Author it from the shipped template (templates/base/spec.md.tpl) — one `## REQ-NNN — <title>` section per requirement.",
    "AI_RULES.md":
      "Author it from templates/backend/AI_RULES.md.tpl (or frontend) — it is the agent's project rulebook.",
    "README.md": "Add a README.md describing how to build and test the project.",
    "docs/specs/traceability.md": `Create it with the rich matrix header:\n  ${RICH_HEADER}`,
    "docs/specs/adr/README.md":
      "Create docs/specs/adr/README.md as the index of your Architecture Decision Records.",
  };
  for (const f of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(targetDir, f))) {
      fail(`Missing required file: ${f}`, 1, [
        FILE_FIXES[f] || `Create ${f}.`,
        "Generated projects include every required file — compare with `create-spec-driven-app init --yes --out <tmp>`.",
      ]);
    }
  }

  // At least one .feature file
  const featuresDir = path.join(targetDir, "features");
  const featureFiles = findRecursive(featuresDir, (f) => f.endsWith(".feature"));
  if (featureFiles.length < 1) {
    fail("No .feature files were found in features/", 1, [
      "Write at least one Gherkin scenario, e.g. features/<area>/<name>.feature,",
      "or pull scenarios from a domain pack: create-spec-driven-app specops add --pack-repo <url> …",
    ]);
  }
  const featureCount = featureFiles.length;

  // Unresolved placeholders anywhere in the project
  const allFiles = walk(targetDir);
  const offenders = [];
  for (const f of allFiles) {
    let content;
    try {
      content = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    if (PLACEHOLDER_RE.test(content)) {
      offenders.push(f);
    }
  }
  if (offenders.length > 0) {
    logError("Unresolved placeholders detected");
    const tokens = new Set();
    for (const f of offenders) {
      const lines = fs.readFileSync(f, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (PLACEHOLDER_RE.test(lines[i])) {
          process.stderr.write(`${f}:${i + 1}:${lines[i]}\n`);
          for (const m of lines[i].match(/\{\{[A-Z_][A-Z0-9_]*\}\}/g) || []) tokens.add(m);
        }
      }
    }
    const varList = [...tokens].map((t) => String(t).replace(/[{}]/g, "")).join(", ");
    logFix([
      `Replace the tokens with real values, or re-expand the pack passing each variable:`,
      `  create-spec-driven-app specops sync --project-dir . (after adding the missing vars to .specops.lock)`,
      `Missing variables: ${varList}`,
    ]);
    process.exit(1);
  }

  // Traceability mode detection
  const tracePath = path.join(targetDir, "docs/specs/traceability.md");
  const traceContent = fs.readFileSync(tracePath, "utf8");
  let traceMode;
  if (traceContent.includes(RICH_HEADER)) {
    traceMode = "rich";
  } else if (traceContent.includes(LEGACY_HEADER)) {
    traceMode = "legacy";
  } else {
    fail("traceability.md is missing the expected legacy or rich matrix header", 1, [
      "Add the rich matrix header (recommended) to docs/specs/traceability.md:",
      `  ${RICH_HEADER}`,
    ]);
  }

  // Status validation + duplicate scenario detection
  const seenScenarios = new Set();
  const matrixRows = parseMatrixRows(traceContent, traceMode);

  // Collect requirement IDs referenced in the matrix (for strict-tdd check)
  const reqsInMatrix = new Set();

  const strictTddViolations = [];

  for (const { cells } of matrixRows) {
    let status;
    let scenarioId;
    let testArtifact;
    let requirementId;

    if (traceMode === "rich") {
      requirementId = cells[1] || "";
      scenarioId = cells[2] || "";
      testArtifact = cells[9] || "";
      status = cells[10] || "";
    } else {
      // legacy: | Feature | Scenario | Technical artifact | Status |
      scenarioId = cells[2] || "";
      testArtifact = cells[3] || "";
      status = cells[4] || "";
    }

    if (requirementId) reqsInMatrix.add(requirementId);

    if (scenarioId && scenarioId !== "-") {
      if (seenScenarios.has(scenarioId)) {
        fail(`Duplicate Scenario ID in traceability.md: ${scenarioId}`, 1, [
          "Every Scenario ID must be unique across the matrix — renumber one of the rows",
          `(e.g. keep ${scenarioId} on the first row and give the second a new ID).`,
        ]);
      }
      seenScenarios.add(scenarioId);
    }

    if (status && !ALLOWED_STATUS.has(status)) {
      fail(`Invalid status in traceability.md: ${status}`, 1, [
        `Allowed statuses: ${[...ALLOWED_STATUS].join(" · ")}`,
        "Use `create-spec-driven-app done <REQ-id>` to flip a row to Implemented safely.",
      ]);
    }

    // --strict-tdd checks per row
    if (strictTdd) {
      if (testArtifact.toUpperCase() === "TBD" && status && POST_DRAFT_STATUS.has(status)) {
        strictTddViolations.push(
          `[TDD-1] Test artifact is TBD but status is '${status}' (scenario: ${scenarioId || "(no id)"})`
        );
      }

      if (traceMode === "rich" && !scenarioId && status && status !== "Draft") {
        strictTddViolations.push(
          `[TDD-2] Traceability row missing Scenario ID with status '${status}' (requirement: ${requirementId || "(none)"})`
        );
      }
    }
  }

  // --strict-tdd: every requirement in spec.md must appear in the matrix
  if (strictTdd && traceMode === "rich") {
    const specPath = path.join(targetDir, "spec.md");
    const specContent = fs.readFileSync(specPath, "utf8");
    const reqPattern = /\bREQ-\d+\b/g;
    const specReqs = new Set(specContent.match(reqPattern) || []);
    for (const reqId of specReqs) {
      if (!reqsInMatrix.has(reqId)) {
        strictTddViolations.push(
          `[TDD-3] Requirement ${reqId} found in spec.md but has no row in traceability.md`
        );
      }
    }
  }

  if (strictTddViolations.length > 0) {
    logError("--strict-tdd violations detected:");
    for (const v of strictTddViolations) {
      process.stderr.write(`  ${v}\n`);
    }
    const codes = new Set(strictTddViolations.map((v) => v.slice(1, 6)));
    const TDD_FIXES = {
      "TDD-1":
        "TDD-1: write the test first, then set its path in the row's 'Test artifact' column (or move the status back to Draft).",
      "TDD-2":
        "TDD-2: give the row a Scenario ID that matches a scenario in its feature file (e.g. SCN-001).",
      "TDD-3":
        "TDD-3: add a traceability row for the requirement — run `create-spec-driven-app plan` to list what each REQ still needs.",
    };
    logFix([...codes].sort().map((c) => TDD_FIXES[c]));
    process.exit(1);
  }

  // Every feature file must be referenced in the matrix.
  // Templates use POSIX paths; normalise Windows backslashes before comparing.
  for (const ff of featureFiles.sort()) {
    const rel = path.relative(targetDir, ff).split(path.sep).join("/");
    if (!traceContent.includes(rel)) {
      const exampleRow =
        traceMode === "rich"
          ? `| REQ-TBD | SCN-TBD | \`${rel}\` | UC-TBD | TBD | TBD | TBD | TBD | TBD | Draft |`
          : `| \`${rel}\` | <scenario> | TBD | Draft |`;
      fail(`Feature file missing from traceability.md: ${rel}`, 1, [
        "Add a row for it to docs/specs/traceability.md, e.g.:",
        `  ${exampleRow}`,
      ]);
    }
  }

  // Optional DDD Lite document headers
  const useCasesPath = path.join(targetDir, "docs/specs/use-cases.md");
  if (fs.existsSync(useCasesPath)) {
    const content = fs.readFileSync(useCasesPath, "utf8");
    if (
      !content.includes("| ID | Use Case | Actor | Requirement | Command/Query | Aggregate | Emits")
    ) {
      fail("use-cases.md is missing the expected table header", 1, [
        "Start the use-case table with:",
        "  | ID | Use Case | Actor | Requirement | Command/Query | Aggregate | Emits |",
      ]);
    }
  }
  const eventsPath = path.join(targetDir, "docs/specs/events.md");
  if (fs.existsSync(eventsPath)) {
    const content = fs.readFileSync(eventsPath, "utf8");
    if (!content.includes("| ID | Event | Producer | Consumers | Payload |")) {
      fail("events.md is missing the expected table header", 1, [
        "Start the events table with:",
        "  | ID | Event | Producer | Consumers | Payload |",
      ]);
    }
  }

  // Success summary
  logInfo("✅ Validation passed");
  logInfo(`- Features detected: ${featureCount}`);
  logInfo("- Base SDD structure: complete");
  logInfo(`- Traceability mode: ${traceMode}`);
  if (strictTdd) logInfo("- Strict TDD gate: passed");
  process.exit(0);
}

main();
