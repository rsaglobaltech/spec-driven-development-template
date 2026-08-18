#!/usr/bin/env node
"use strict";

/**
 * `doctor` — diagnose a spec-driven project and the local environment,
 * reporting every finding with a concrete fix. Unlike `validate` (a
 * fail-fast CI gate), doctor runs ALL checks and never stops at the first
 * problem — it is the "why is my setup broken?" command.
 *
 * Usage:
 *   csda doctor [--project-dir <dir>]
 *
 * Exit codes: 0 = no errors (warnings allowed), 1 = at least one error.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { resolveProjectDir } = require("./lib/project-root");
const { diagnostic } = require("./lib/diagnostics");
const { findUnresolvedPlaceholders } = require("./lib/placeholders");
const { agentIo, wantsJson, EXIT } = require("./lib/agent");

const RICH_HEADER =
  "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |";
const LEGACY_HEADER = "| Feature | Scenario | Technical artifact | Status |";

// ── Findings collection ───────────────────────────────────────────────────────

const findings = [];

function ok(check, detail) {
  findings.push({ level: "ok", check, detail });
}
function warn(check, detail, fix) {
  findings.push({ level: "warn", check, detail, fix });
}
function error(check, detail, fix) {
  findings.push({ level: "error", check, detail, fix });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

// ── Checks ────────────────────────────────────────────────────────────────────

/**
 * Where this CLI is running from, and what version it is.
 *
 * A real user reported `-v` printing 0.1.2 after installing "the latest". The
 * tool was right — it *was* 0.1.2, from a global install made months earlier.
 * `npx create-spec-driven-app@latest` runs a temporary copy and never touches a
 * global one, so the two answer different questions and nothing said so.
 *
 * No network call: which version is newest is not doctor's business, and a
 * lookup here would break the offline and air-gapped modes the tool promises.
 * Naming the installation is enough — a stale global becomes obvious the moment
 * you can see you are running one.
 */
function describeInstall() {
  const rootDir = path.resolve(__dirname, "..", "..");
  let version = "unknown";
  try {
    version = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version;
  } catch {
    // A package.json we cannot read is reported as such rather than guessed at.
  }

  const posix = rootDir.split(path.sep).join("/");
  let kind = "local checkout";
  if (/\/(_npx|\.npm\/_npx)\//.test(posix)) kind = "npx cache — temporary, not installed";
  else if (/\/lib\/node_modules\//.test(posix)) kind = "global install";
  else if (/\/node_modules\//.test(posix)) kind = "project dependency";

  return { version, rootDir, kind };
}

function nodeFloor() {
  // Read the floor rather than repeat it. This check said ">= 20" for a release
  // after the floor moved to 22, which is the same drift the floor guard exists
  // to prevent.
  try {
    const engines = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "..", "..", "package.json"), "utf8")
    ).engines;
    const n = Number(String(engines.node).replace(/[^0-9]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 22;
  } catch {
    return 22;
  }
}

function checkEnvironment() {
  const install = describeInstall();
  ok("csda", `v${install.version} — ${install.kind}\n     ${install.rootDir}`);

  const floor = nodeFloor();
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= floor) {
    ok("Node.js", `v${process.versions.node}`);
  } else {
    error(
      "Node.js",
      `v${process.versions.node} is below the required minimum`,
      `Install Node.js >= ${floor} (https://nodejs.org) or use nvm/fnm to switch.`
    );
  }

  const git = spawnSync("git", ["--version"], { encoding: "utf8", shell: false });
  if (git.status === 0) {
    ok("git", git.stdout.trim());
  } else {
    warn(
      "git",
      "git is not available on PATH",
      "Install git — init, specops (remote packs) and harness need it."
    );
  }
}

function checkStructure(dir) {
  const required = [
    "spec.md",
    "AI_RULES.md",
    "README.md",
    "docs/specs/traceability.md",
    "docs/specs/adr/README.md",
  ];
  const missing = required.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length === 0) {
    ok("SDD structure", "all required files present");
  } else {
    for (const f of missing) {
      error(
        "SDD structure",
        `missing required file: ${f}`,
        "Run `csda adopt` (brownfield) to generate missing skeleton files without overwriting anything."
      );
    }
  }

  if (!fs.existsSync(path.join(dir, "features"))) {
    error(
      "features/",
      "directory does not exist",
      "Create features/ and add at least one .feature file (or `specops add` a pack)."
    );
  }
}

function checkTraceability(dir) {
  const tracePath = path.join(dir, "docs/specs/traceability.md");
  const trace = readIfExists(tracePath);
  if (trace === null) return; // already reported by checkStructure

  let mode = null;
  if (trace.includes(RICH_HEADER)) mode = "rich";
  else if (trace.includes(LEGACY_HEADER)) mode = "legacy";
  if (!mode) {
    error(
      "traceability.md",
      "matrix header not recognised",
      `Paste the rich header into docs/specs/traceability.md:\n      ${RICH_HEADER}`
    );
    return;
  }
  ok("traceability.md", `${mode} matrix`);

  // Feature files ⇄ matrix, both directions.
  const featuresDir = path.join(dir, "features");
  const featureFiles = fs.existsSync(featuresDir)
    ? walk(featuresDir).filter((f) => f.endsWith(".feature"))
    : [];
  if (featureFiles.length === 0) {
    error(
      "features/",
      "no .feature files found",
      "Write at least one Gherkin scenario or `specops add` a domain pack."
    );
  } else {
    ok("features/", `${featureFiles.length} feature file(s)`);
  }

  const orphanFeatures = featureFiles
    .map((ff) => path.relative(dir, ff).split(path.sep).join("/"))
    .filter((rel) => !trace.includes(rel));
  for (const rel of orphanFeatures) {
    error(
      "orphan feature",
      `${rel} has no row in traceability.md`,
      `Add a matrix row referencing \`${rel}\` (validate prints a paste-ready one).`
    );
  }

  // Matrix rows pointing at feature files that do not exist (validate misses this).
  const referenced = trace.match(/`(features\/[^`]+\.feature)`/g) || [];
  for (const raw of referenced) {
    const rel = raw.replace(/`/g, "");
    if (!fs.existsSync(path.join(dir, rel))) {
      error(
        "dangling matrix row",
        `traceability.md references ${rel}, which does not exist`,
        `Create ${rel} or fix/remove the row pointing at it.`
      );
    }
  }

  // REQs in the spec tree ⇄ matrix, both directions.
  //
  // The spec tree is root spec.md *plus* docs/specs/capabilities/, where
  // `change archive` merges requirements. Reading only the root file reported
  // every archived requirement as a stale matrix row.
  const spec = readSpecTree(dir);
  if (spec !== null) {
    const specReqs = new Set(spec.match(/\bREQ-\d+\b/g) || []);
    const matrixReqs = new Set<string>(trace.match(/\bREQ-\d+\b/g) || []);
    for (const req of specReqs) {
      if (!matrixReqs.has(req)) {
        warn(
          "requirement coverage",
          `${req} is in spec.md but has no traceability row`,
          "Add a row for it — `csda plan` lists what each REQ still needs."
        );
      }
    }
    for (const req of matrixReqs) {
      if (req !== "REQ-TBD" && !specReqs.has(req)) {
        warn(
          "requirement coverage",
          `${req} is in traceability.md but spec.md has no section for it`,
          `Add a \`## ${req} — <title>\` section to spec.md (or remove the stale row).`
        );
      }
    }
  }
}

/** Root spec.md concatenated with every archived capability spec, or null. */
function readSpecTree(dir) {
  const parts = [];
  const root = readIfExists(path.join(dir, "spec.md"));
  if (root !== null) parts.push(root);

  const capabilities = path.join(dir, "docs/specs/capabilities");
  if (fs.existsSync(capabilities)) {
    for (const entry of fs.readdirSync(capabilities, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const spec = readIfExists(path.join(capabilities, entry.name, "spec.md"));
      if (spec !== null) parts.push(spec);
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * The change lifecycle's own failure modes.
 *
 * These are the ones that accumulate silently: a delta nobody archived, an
 * archived change whose tasks were never finished, a requirement in the matrix
 * that no spec describes. None of them break a build, which is exactly why they
 * need a command that goes looking.
 */
function checkChanges(dir) {
  const changesDir = path.join(dir, "docs/specs/changes");
  if (!fs.existsSync(changesDir)) {
    ok("changes", "no change directory (not using the change lifecycle — that is fine)");
    return;
  }

  const {
    listChangeIds,
    listArchivedIds,
    listDeltas,
    taskProgress,
    readConfig,
    paths,
    parseTasks,
  } = require("./change/common");

  const active = listChangeIds(dir);
  const archived = listArchivedIds(dir);

  for (const id of active) {
    const deltas = listDeltas(dir, id);
    const config = readConfig(dir, id);
    const progress = taskProgress(dir, id);

    // A change with every task done but never archived is work that has landed
    // in the code and not in the specs — the drift the lifecycle exists to stop.
    if (progress.total > 0 && progress.remaining === 0) {
      warn(
        "stale change",
        `${id} has all ${progress.total} tasks checked but is still active`,
        `Archive it: csda change archive ${id} --dry-run`
      );
    }

    if (deltas.length === 0 && config.skip_specs !== true) {
      warn(
        "empty change",
        `${id} declares no delta specs`,
        `Write one under docs/specs/changes/${id}/specs/<capability>/spec.md, or set skip_specs: true in its change.yaml if this change has no behavioural impact.`
      );
    }
  }

  // taskProgress only looks under changes/; an archived change has moved.
  for (const id of archived) {
    const tasksFile = path.join(paths(dir).archive, id, "tasks.md");
    const raw = readIfExists(tasksFile);
    if (raw === null) continue;
    const tasks = parseTasks(raw);
    const remaining = tasks.filter((t) => !t.done).length;
    if (tasks.length > 0 && remaining > 0) {
      warn(
        "archived with open tasks",
        `${id} was archived with ${remaining} task(s) unchecked`,
        "Either the tasks were not needed — delete them — or the work is unfinished and needs a follow-up change."
      );
    }
  }

  if (active.length === 0 && archived.length === 0) {
    ok("changes", "no changes yet");
  } else {
    ok("changes", `${active.length} active, ${archived.length} archived`);
  }
}

/**
 * Requirements that reached the matrix but no spec describes, and vice versa.
 *
 * `checkTraceability` already compares the matrix against the spec tree. This
 * looks at the other direction the change lifecycle introduces: a capability
 * spec whose requirements never made it into the matrix, which means `plan`
 * will never list them and nobody will implement them.
 */
function checkCapabilityDrift(dir) {
  const capabilities = path.join(dir, "docs/specs/capabilities");
  if (!fs.existsSync(capabilities)) return;

  const trace = readIfExists(path.join(dir, "docs/specs/traceability.md"));
  if (trace === null) return;
  const inMatrix = new Set(trace.match(/\bREQ-\d+\b/g) || []);

  let checked = 0;
  for (const entry of fs.readdirSync(capabilities, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const spec = readIfExists(path.join(capabilities, entry.name, "spec.md"));
    if (spec === null) continue;
    for (const req of new Set(spec.match(/\bREQ-\d+\b/g) || [])) {
      checked++;
      if (!inMatrix.has(req)) {
        warn(
          "capability drift",
          `${req} is in the ${entry.name} capability spec but has no traceability row`,
          `csda req add` + " — or re-run `csda change archive`, which writes the row for you."
        );
      }
    }
  }
  if (checked > 0) ok("capability specs", `${checked} requirement(s) reconciled with the matrix`);
}

function checkPlaceholders(dir) {
  const offenders = findUnresolvedPlaceholders(dir);
  if (offenders.length === 0) {
    ok("placeholders", "no unresolved {{...}} tokens");
  } else {
    for (const f of offenders) {
      error(
        "placeholders",
        `unresolved {{...}} tokens in ${f}`,
        "Replace them with real values, or re-expand the pack with the missing --var values."
      );
    }
  }
}

/**
 * The scaffold's starter requirement, still present after a pack landed.
 *
 * `csda init` seeds REQ-000 with a health scenario so a new project has one
 * example that works end to end. Install a domain pack afterwards and the pack
 * brings its own requirements — frequently including its own health one — so
 * REQ-000 becomes a second requirement for the same thing, carried forward by
 * `include_existing_rows`. Found by dogfooding: csda-studio-app ended up with
 * REQ-000 and the pack's REQ-015 both describing deployment health.
 *
 * Only fires when the row still looks untouched. A REQ-000 someone has adopted
 * and filled in is theirs, not a leftover.
 */
function checkSampleRequirement(dir) {
  if (!fs.existsSync(path.join(dir, ".specops.lock"))) return;
  const traceRaw = readIfExists(path.join(dir, "docs/specs/traceability.md"));
  if (traceRaw === null) return;

  const row = traceRaw.split("\n").find((line) => /^\|\s*REQ-000\s*\|/.test(line));
  if (!row) return;

  // The template's own wording. Edited cells mean the project adopted it.
  const untouched = row.includes("features/core/health.feature") && /\bDraft\b/.test(row);
  if (!untouched) {
    ok("sample requirement", "REQ-000 has been adapted — treating it as yours");
    return;
  }

  warn(
    "sample requirement",
    "REQ-000 is the scaffold's starter requirement and a domain pack is installed — " +
      "the pack's own requirements now cover this",
    "Remove the REQ-000 row from docs/specs/traceability.md and delete " +
      "features/core/health.feature, unless you meant to keep it. " +
      "New projects can skip it with `csda init --no-sample-req` (implied by --from-pack)."
  );
}

function checkSpecops(dir) {
  const lockPath = path.join(dir, ".specops.lock");
  const lockRaw = readIfExists(lockPath);
  if (lockRaw === null) {
    ok("specops", "no lockfile (packs not used — that is fine at L1/L2)");
    return;
  }
  let lock;
  try {
    lock = JSON.parse(lockRaw);
  } catch (err) {
    error(
      "specops",
      `.specops.lock is not valid JSON: ${err.message}`,
      "Restore it from git history, or delete it and re-run `specops add` for each pack."
    );
    return;
  }
  const packs = Array.isArray(lock.packs) ? lock.packs : [];
  ok("specops", `.specops.lock with ${packs.length} pack(s)`);

  if (packs.length > 0 && !fs.existsSync(path.join(dir, ".specops", "baseline"))) {
    warn(
      "specops baseline",
      ".specops/baseline/ is missing — `specops sync` cannot three-way merge",
      "Re-run `specops sync` to regenerate it, and commit .specops/baseline/."
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  const start = argv[0] === "doctor" ? 1 : 0;
  let projectDir = null;
  for (let i = start; i < argv.length; i++) {
    if (argv[i] === "--project-dir" && argv[i + 1]) projectDir = argv[++i];
    else if (argv[i] === "--json") continue;
    else if (argv[i] === "--help" || argv[i] === "-h") {
      process.stdout.write(
        "Usage:\n  csda doctor [--project-dir <dir>] [--json]\n\n" +
          "Runs every diagnostic (environment, structure, traceability in both\n" +
          "directions, placeholders, specops lockfile) and prints a fix per finding.\n"
      );
      process.exit(0);
    }
  }

  const io = agentIo(wantsJson(argv));

  checkEnvironment();

  const dir = resolveProjectDir(projectDir || ".");
  if (!io.json) process.stdout.write(`\n🩺 Doctor report for: ${dir}\n\n`);

  if (!fs.existsSync(path.join(dir, "spec.md"))) {
    error(
      "project",
      "spec.md not found — this directory is not spec-driven yet",
      "Run `csda adopt` here (existing code) or `init` (new project)."
    );
  } else {
    checkStructure(dir);
    checkTraceability(dir);
    checkCapabilityDrift(dir);
    checkChanges(dir);
    checkPlaceholders(dir);
    checkSpecops(dir);
    checkSampleRequirement(dir);
  }

  const errors = findings.filter((f) => f.level === "error").length;
  const warns = findings.filter((f) => f.level === "warn").length;

  if (io.json) {
    // A doctor finding already is a diagnostic — it has a check, a detail and a
    // fix. Only the severity vocabulary differs, so map it and reuse the
    // envelope rather than inventing a second shape.
    const SEVERITY_OF = { ok: "info", warn: "warning", error: "error" };
    io.emit({
      doctor: {
        projectDir: dir,
        errors,
        warnings: warns,
        passed: findings.length - errors - warns,
      },
      status: findings.map((f) =>
        diagnostic(
          SEVERITY_OF[f.level],
          // `check` is a display name ("requirement coverage"); `code` is the
          // stable surface an agent branches on, so slug it.
          `doctor_${String(f.check)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "")}`,
          f.detail,
          { target: f.check, ...(f.fix ? { fix: f.fix } : {}) }
        )
      ),
    });
    process.exit(errors === 0 ? EXIT.OK : EXIT.FAILURE);
  }

  const icons = { ok: "✅", warn: "⚠️", error: "❌" };
  for (const f of findings) {
    process.stdout.write(`${icons[f.level]} ${f.check}: ${f.detail}\n`);
    if (f.fix) process.stdout.write(`   💡 Fix: ${f.fix}\n`);
  }

  process.stdout.write(
    `\n${errors === 0 ? "✅" : "❌"} ${errors} error(s), ${warns} warning(s), ` +
      `${findings.length - errors - warns} check(s) passed\n`
  );
  process.exit(errors === 0 ? EXIT.OK : EXIT.FAILURE);
}

main();
