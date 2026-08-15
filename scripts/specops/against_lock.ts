"use strict";

/**
 * `validate --against-lock` — the drift gate.
 *
 * SpecOps has always been able to tell you that files differ. What it could
 * not tell you is *which requirements* the project no longer honours, which is
 * the only form of drift a reviewer can act on. This module answers that:
 * it resolves each locked pack, reads its requirement model, and checks the
 * project's traceability matrix against it.
 *
 * Requirement-level, not file-level. A pack whose templates were reformatted
 * reports no drift; a pack whose REQ-005 never made it into the project does.
 */

const fs = require("node:fs");

const { readLock } = require("./lock");
const { resolveRemotePack } = require("../domain-pack/remote");
const { loadPackModel, requirementsById, scenariosByRequirement } = require("./as_change");
const { parseTraceabilityRows } = require("../domain-pack/common");
const { paths } = require("../change/common");
const { error, warning, info } = require("../lib/diagnostics");

/** Strip the backticks the generated matrix wraps paths in. */
function bare(value) {
  return String(value === undefined || value === null ? "" : value)
    .trim()
    .replace(/^`|`$/g, "");
}

const EMPTY = new Set(["", "-", "TBD"]);
const isEmpty = (v) => EMPTY.has(bare(v));

/**
 * Compare one pack's requirement model against the project's matrix.
 *
 * @returns diagnostics[] — empty when the project still honours the pack.
 */
function checkPackAgainstProject(model, entry, matrixRows) {
  const diagnostics = [];
  const requirements = requirementsById(model);
  const scenarios = scenariosByRequirement(model);

  const rowFor = (id) =>
    matrixRows.find((r) => bare(r.requirement).toUpperCase() === String(id).toUpperCase());

  for (const [id, req] of requirements) {
    const row = rowFor(id);
    const label = `${id} — ${req.title || id}`;

    if (!row) {
      diagnostics.push(
        error(
          "pack_requirement_missing",
          `${label} is declared by the pack but absent from the project.`,
          {
            target: id,
            fix: `Run \`csda specops sync --pack ${entry.pack_id}\` to bring it in.`,
          }
        )
      );
      continue;
    }

    // The matrix records the scenario and the feature file the pack declares.
    // Those are the two fields that must still line up for the requirement to
    // be the one the pack asked for.
    const packScenarios = scenarios.get(id) || [];
    const expectedScenario = packScenarios[0] && packScenarios[0].id;
    const expectedFeature = packScenarios[0] && packScenarios[0].target;

    if (expectedScenario && !isEmpty(row.scenarioId) && bare(row.scenarioId) !== expectedScenario) {
      diagnostics.push(
        error(
          "pack_requirement_drifted",
          `${label} points at scenario ${bare(row.scenarioId)}, but the pack declares ${expectedScenario}.`,
          {
            target: id,
            fix: `Reconcile with \`csda specops diff --pack ${entry.pack_id} --as-change\`, or accept the local decision by recording it in a change.`,
          }
        )
      );
    }

    if (expectedFeature && !isEmpty(row.featureFile) && bare(row.featureFile) !== expectedFeature) {
      diagnostics.push(
        error(
          "pack_requirement_drifted",
          `${label} points at feature ${bare(row.featureFile)}, but the pack declares ${expectedFeature}.`,
          {
            target: id,
            fix: `Reconcile with \`csda specops diff --pack ${entry.pack_id} --as-change\`, or accept the local decision by recording it in a change.`,
          }
        )
      );
    }
  }

  // Requirements the project has that the pack does not declare are not drift
  // — they are local work, which is the normal case. Reported as info so the
  // output is a complete picture rather than a one-sided one.
  const local = matrixRows.filter((r) => {
    const id = bare(r.requirement).toUpperCase();
    return id && !requirements.has(id) && /^REQ-/.test(id);
  });
  if (local.length > 0) {
    diagnostics.push(
      info("local_requirements", `${local.length} requirement(s) are local to this project.`, {
        target: local.map((r) => bare(r.requirement)).join(", "),
      })
    );
  }

  return diagnostics;
}

/**
 * Run the gate for every pack in the lockfile.
 *
 * @returns { checked, diagnostics } — `checked` is 0 when the project has no
 *          lockfile, which is not a failure: a project that never adopted a
 *          pack cannot have drifted from one.
 */
function checkAgainstLock(projectDir, opts?) {
  const o = opts || {};
  const diagnostics = [];
  const lock = readLock(projectDir);

  if (!lock || !Array.isArray(lock.packs) || lock.packs.length === 0) {
    return { checked: 0, diagnostics };
  }

  const traceabilityFile = paths(projectDir).traceability;
  const matrix = fs.existsSync(traceabilityFile)
    ? parseTraceabilityRows(fs.readFileSync(traceabilityFile, "utf8"))
    : { mode: "rich", rows: [] };

  if (matrix.mode !== "rich") {
    diagnostics.push(
      warning(
        "traceability_legacy_format",
        "traceability.md uses the legacy 4-column format; requirement-level drift cannot be checked.",
        {
          fix: "Migrate the matrix to the 10-column format.",
        }
      )
    );
    return { checked: 0, diagnostics };
  }

  let checked = 0;
  for (const entry of lock.packs) {
    if (o.pack && entry.pack_id !== o.pack) continue;
    if (!entry.repo) continue;

    let resolved;
    try {
      resolved = resolveRemotePack({
        repo: entry.repo,
        version: entry.version,
        cacheDir: o.cacheDir || undefined,
      });
    } catch (err) {
      diagnostics.push(
        error(
          "pack_unavailable",
          `Could not resolve ${entry.pack_id}@${entry.version}: ${err.message}`,
          {
            target: entry.pack_id,
            fix: "Check network access and that the pinned tag still exists upstream.",
          }
        )
      );
      continue;
    }

    let loaded;
    try {
      loaded = loadPackModel(resolved.packRoot, entry.pack_id);
    } catch (err) {
      diagnostics.push(
        error("pack_unreadable", `Could not read the model of ${entry.pack_id}: ${err.message}`, {
          target: entry.pack_id,
          fix: "The locked tag may not contain this pack id any more.",
        })
      );
      continue;
    }

    checked += 1;
    diagnostics.push(...checkPackAgainstProject(loaded.model, entry, matrix.rows));
  }

  return { checked, diagnostics };
}

module.exports = { checkAgainstLock, checkPackAgainstProject, bare };
