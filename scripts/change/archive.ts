"use strict";

/**
 * `csda change archive` — the merge engine.
 *
 * Where a documentation tool would stop after folding markdown into markdown,
 * this one keeps going: it upserts the traceability matrix from the
 * `csda:trace` comments and materialises the proposed `.feature` files, so the
 * newly-archived requirement lands under `validate --strict-tdd` and fails the
 * build until its test exists. That failure is the point.
 *
 * Order of operations (see docs/specs/adr/0015-change-lifecycle.md):
 *
 *   1. validate           → abort on any invalid delta
 *   2. resolve            → deltas to capabilities, detect collisions
 *   3. plan               → compute every write in memory
 *   4. apply specs        → capabilities/<cap>/spec.md
 *   5. sync traceability  → upsert rows from csda:trace
 *   6. materialise features
 *   7. move to archive/YYYY-MM-DD-<id>
 *   8. report
 *
 * Steps 4-7 are transactional: everything is staged first, and a failure
 * anywhere restores the files already written.
 */

const fs = require("node:fs");
const path = require("node:path");

const { applyDelta, validateDelta } = require("./delta");
const { parseDelta } = require("./parser");
const { paths, listDeltas, listChangeFeatures, readConfig, taskProgress } = require("./common");
const { parseTraceabilityRows, buildTraceabilityMarkdown } = require("../domain-pack/common");
const { error, warning } = require("../lib/diagnostics");

function todayStamp(now?) {
  const d = now instanceof Date ? now : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

/** Human-readable capability title: `billing/invoicing` → `Billing / Invoicing`. */
function capabilityTitle(capability) {
  return String(capability)
    .split("/")
    .map((part) => part.replace(/[-_]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()))
    .join(" / ");
}

// ── Traceability ──────────────────────────────────────────────────────────────

const EMPTY = "-";

/** Paths are backticked in the generated matrix; match that so the table reads uniformly. */
function code(value) {
  if (!value || value === EMPTY) return EMPTY;
  return /^`.*`$/.test(value) ? value : `\`${value}\``;
}

function traceRow(req) {
  const trace = req.trace || {};
  const firstScenario = (req.scenarios || [])[0];
  return {
    requirement: req.id || req.name,
    scenarioId: trace.scn || (firstScenario && firstScenario.id) || EMPTY,
    featureFile: code(trace.feature),
    useCase: trace.uc || EMPTY,
    commandOrQuery: trace.cmd || trace.qry || EMPTY,
    aggregate: trace.agg || EMPTY,
    event: trace.evt || EMPTY,
    technicalArtifact: code(trace.artifact),
    testArtifact: trace.test || "TBD",
    status: trace.status || "Draft",
  };
}

/**
 * The columns the delta actually spoke about.
 *
 * This is the difference between an upsert and a clobber. `traceRow` fills in
 * defaults so a brand-new row is complete; those defaults must never travel
 * into an existing row. Re-archiving a change that touches an already
 * `Implemented` requirement would otherwise reset it to `Draft` and quietly
 * take it back out from under the --strict-tdd gate.
 */
function statedFields(req) {
  const trace = req.trace || {};
  const firstScenario = (req.scenarios || [])[0];
  const stated: any = {};
  if (trace.scn || (firstScenario && firstScenario.id)) {
    stated.scenarioId = trace.scn || firstScenario.id;
  }
  if (trace.feature) stated.featureFile = code(trace.feature);
  if (trace.uc) stated.useCase = trace.uc;
  if (trace.cmd || trace.qry) stated.commandOrQuery = trace.cmd || trace.qry;
  if (trace.agg) stated.aggregate = trace.agg;
  if (trace.evt) stated.event = trace.evt;
  if (trace.artifact) stated.technicalArtifact = code(trace.artifact);
  if (trace.test) stated.testArtifact = trace.test;
  if (trace.status) stated.status = trace.status;
  return stated;
}

/**
 * Upsert rows keyed by requirement id. An existing row keeps any column the
 * delta does not speak about — a change that only adds a scenario must not
 * blank out the implementation columns a previous change filled in.
 */
function syncTraceability(existingContent, applied) {
  const parsed = existingContent
    ? parseTraceabilityRows(existingContent)
    : { mode: "rich", rows: [] };
  // The lifecycle only writes the rich (10-column) matrix. A legacy 4-column
  // matrix is upgraded in place the first time a change is archived.
  const rows = parsed.mode === "rich" ? parsed.rows.slice() : [];
  const legacyDropped = parsed.mode !== "rich" ? parsed.rows.length : 0;

  const indexOf = (requirement) =>
    rows.findIndex((r) => String(r.requirement).trim() === String(requirement).trim());

  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const entry of applied.upserts) {
    const row = traceRow(entry.req);
    const idx = indexOf(row.requirement);
    if (idx === -1) {
      rows.push(row);
      added++;
    } else {
      // Only the columns this delta stated; everything else keeps the value a
      // previous change (or a human) put there.
      rows[idx] = { ...rows[idx], ...statedFields(entry.req) };
      updated++;
    }
  }

  for (const requirement of applied.removals) {
    const idx = indexOf(requirement);
    if (idx !== -1) {
      rows.splice(idx, 1);
      removed++;
    }
  }

  return {
    markdown: buildTraceabilityMarkdown(rows, "rich"),
    totals: { added, updated, removed, legacyDropped },
  };
}

// ── Planning ──────────────────────────────────────────────────────────────────

/**
 * Compute every write the archive would perform, without touching disk.
 * `--dry-run` prints this and stops; the real run hands it to `executeArchive`.
 */
function planArchive(projectDir, changeId, opts?) {
  const o = opts || {};
  const p = paths(projectDir);
  const diagnostics = [];
  const warnings = [];
  const writes = [];
  const deletes = [];

  const changeDir = p.change(changeId);
  if (!fs.existsSync(changeDir)) {
    diagnostics.push(
      error("archive_change_not_found", `Change "${changeId}" does not exist.`, {
        target: changeId,
        fix: `Run \`csda change list\` to see active changes.`,
      })
    );
    return { ok: false, diagnostics, writes, deletes, warnings };
  }
  if (fs.lstatSync(changeDir).isSymbolicLink()) {
    diagnostics.push(
      error("archive_change_symlink", `Change "${changeId}" is a symlink; refusing to archive.`, {
        target: changeId,
        fix: "Replace the symlink with a real directory.",
      })
    );
    return { ok: false, diagnostics, writes, deletes, warnings };
  }

  const config = readConfig(projectDir, changeId);
  const progress = taskProgress(projectDir, changeId);

  if (progress.remaining > 0 && !o.force) {
    diagnostics.push(
      error(
        "archive_tasks_incomplete",
        `Change "${changeId}" still has ${progress.remaining} unchecked task(s).`,
        {
          target: changeId,
          fix: "Finish the tasks, or pass --force to archive anyway.",
        }
      )
    );
  }

  const deltas = config.skip_specs ? [] : listDeltas(projectDir, changeId);

  if (!config.skip_specs && deltas.length === 0) {
    warnings.push(
      warning("archive_no_deltas", `Change "${changeId}" carries no delta specs.`, {
        target: changeId,
        fix: "Set `skip_specs: true` in change.yaml if this change does not alter behaviour.",
      })
    );
  }

  const applied = { upserts: [], removals: [] };
  const totals = { added: 0, modified: 0, removed: 0, specsWritten: 0, specsRetired: 0 };

  for (const entry of deltas) {
    const deltaSource = fs.readFileSync(entry.file, "utf8");
    const specFile = p.capabilitySpec(entry.capability);
    const specSource = readIfExists(specFile);

    const { diagnostics: deltaDiags } = validateDelta(deltaSource, {
      specSource,
      file: entry.relative,
    });
    for (const d of deltaDiags) {
      if (d.severity === "error") diagnostics.push(d);
      else warnings.push(d);
    }
    if (deltaDiags.some((d) => d.severity === "error")) continue;

    const merged = applyDelta(specSource, deltaSource, {
      title: capabilityTitle(entry.capability),
    });

    totals.added += merged.applied.added.length;
    totals.modified += merged.applied.modified.length;
    totals.removed += merged.applied.removed.length;

    // Collect what the traceability matrix needs, from the delta's own AST so
    // the csda:trace comments survive the merge.
    const parsedDelta = parseDelta(deltaSource);
    for (const req of [...parsedDelta.added, ...parsedDelta.modified]) {
      applied.upserts.push({ req, capability: entry.capability });
    }
    for (const req of parsedDelta.removed) {
      applied.removals.push(req.id || req.name);
    }

    if (merged.retired) {
      if (config.retire_capabilities) {
        deletes.push({ file: specFile, reason: "capability_retired" });
        totals.specsRetired++;
        warnings.push(
          warning(
            "archive_capability_retired",
            `Capability "${entry.capability}" lost its last requirement and its spec was deleted.`,
            {
              target: entry.capability,
              file: path.relative(p.root, specFile),
              fix: `Recover with: git checkout HEAD -- ${path.relative(p.root, specFile)}`,
            }
          )
        );
      } else {
        diagnostics.push(
          error(
            "archive_retire_not_declared",
            `Change "${changeId}" removes the last requirement of "${entry.capability}" but does not declare retire_capabilities.`,
            {
              target: entry.capability,
              fix: "Set `retire_capabilities: true` in change.yaml to confirm the capability should disappear.",
            }
          )
        );
      }
    } else {
      writes.push({ file: specFile, contents: merged.markdown, kind: "spec" });
      totals.specsWritten++;
    }
  }

  // Materialise proposed .feature files into the project's features/ tree.
  for (const feature of listChangeFeatures(projectDir, changeId)) {
    const target = path.join(p.root, "features", feature.relative);
    if (fs.existsSync(target) && !o.force) {
      warnings.push(
        warning(
          "archive_feature_exists",
          `features/${feature.relative} already exists and was left untouched.`,
          {
            target: `features/${feature.relative}`,
            fix: "Delete or merge the existing file, or re-run with --force to overwrite.",
          }
        )
      );
      continue;
    }
    writes.push({
      file: target,
      contents: fs.readFileSync(feature.file, "utf8"),
      kind: "feature",
    });
  }

  // Traceability, from the requirements we just merged.
  let traceTotals = { added: 0, updated: 0, removed: 0, legacyDropped: 0 };
  if (applied.upserts.length > 0 || applied.removals.length > 0) {
    const synced = syncTraceability(readIfExists(p.traceability), applied);
    traceTotals = synced.totals;
    writes.push({ file: p.traceability, contents: synced.markdown, kind: "traceability" });
    if (synced.totals.legacyDropped > 0) {
      warnings.push(
        warning(
          "traceability_upgraded",
          `traceability.md used the legacy 4-column format; ${synced.totals.legacyDropped} row(s) could not be carried over.`,
          {
            file: path.relative(p.root, p.traceability),
            fix: "Re-add those rows in the 10-column format, or restore from git and migrate by hand.",
          }
        )
      );
    }
  }

  const archivedAs = `${o.stamp || todayStamp(o.now)}-${changeId}`;
  const move = { from: changeDir, to: path.join(p.archive, archivedAs) };

  if (fs.existsSync(move.to)) {
    diagnostics.push(
      error("archive_target_exists", `Archive entry "${archivedAs}" already exists.`, {
        target: archivedAs,
        fix: "Rename the change, or remove the existing archive entry.",
      })
    );
  }

  return {
    ok: diagnostics.length === 0,
    changeId,
    archivedAs,
    config,
    diagnostics,
    warnings,
    writes,
    deletes,
    move,
    totals: { ...totals, traceability: traceTotals },
    specsUpdated: totals.specsWritten > 0 || totals.specsRetired > 0,
  };
}

// ── Execution ─────────────────────────────────────────────────────────────────

/**
 * Apply a plan. Staged and reversible: every file we overwrite has its previous
 * content held in memory, and every file we create is remembered, so a failure
 * halfway through leaves the project exactly as it was.
 */
function executeArchive(plan) {
  const undo = [];
  const restore = () => {
    for (const step of undo.reverse()) {
      try {
        if (step.type === "restore") fs.writeFileSync(step.file, step.contents, "utf8");
        else if (step.type === "unlink") fs.rmSync(step.file, { force: true });
        else if (step.type === "rename") fs.renameSync(step.from, step.to);
      } catch {
        // Best effort — the original error is the one worth surfacing.
      }
    }
  };

  try {
    for (const write of plan.writes) {
      fs.mkdirSync(path.dirname(write.file), { recursive: true });
      if (fs.existsSync(write.file)) {
        undo.push({
          type: "restore",
          file: write.file,
          contents: fs.readFileSync(write.file, "utf8"),
        });
      } else {
        undo.push({ type: "unlink", file: write.file });
      }
      fs.writeFileSync(write.file, write.contents, "utf8");
    }

    for (const del of plan.deletes) {
      if (fs.existsSync(del.file)) {
        undo.push({ type: "restore", file: del.file, contents: fs.readFileSync(del.file, "utf8") });
        fs.rmSync(del.file, { force: true });
      }
    }

    fs.mkdirSync(path.dirname(plan.move.to), { recursive: true });
    fs.renameSync(plan.move.from, plan.move.to);
    undo.push({ type: "rename", from: plan.move.to, to: plan.move.from });

    return { ok: true, archivedAs: plan.archivedAs, totals: plan.totals };
  } catch (err) {
    restore();
    throw err;
  }
}

module.exports = {
  planArchive,
  executeArchive,
  syncTraceability,
  traceRow,
  statedFields,
  capabilityTitle,
  todayStamp,
};
