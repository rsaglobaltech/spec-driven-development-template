#!/usr/bin/env node
"use strict";

/**
 * pack lint — semantic validation of a pack.yaml beyond JSON Schema.
 *
 * Usage:
 *   create-spec-driven-app pack lint --pack-root <path> --pack <domain/type>
 */

const { loadPack, asArray } = require("./domain-pack/common");

function logInfo(msg) {
  process.stdout.write(`ℹ️  [INFO] ${msg}\n`);
}
function logWarn(msg) {
  process.stdout.write(`⚠️  [WARN] ${msg}\n`);
}
function logError(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  create-spec-driven-app pack lint --pack-root <path> --pack <domain/type>\n\n" +
      "Options:\n" +
      "  --pack-root   Root directory containing domain packs (required)\n" +
      "  --pack        Pack identifier, e.g. parking-management/backend (required)\n"
  );
}

function parseArgs(argv) {
  const opts = { packRoot: null, packId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pack-root" && argv[i + 1]) {
      opts.packRoot = argv[++i];
    } else if (a === "--pack" && argv[i + 1]) {
      opts.packId = argv[++i];
    } else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
  }
  return opts;
}

// ── Semantic lint rules ───────────────────────────────────────────────────────

function lintTodos(pack, errors, warnings) {
  const yaml = JSON.stringify(pack);
  const count = (yaml.match(/TODO/g) || []).length;
  if (count > 0) {
    warnings.push(`Pack contains ${count} TODO placeholder(s). Replace before shipping.`);
  }
}

function lintRequirementsCoverage(pack, errors, _warnings) {
  const reqIds = new Set(asArray(pack.requirements).map((r) => r.id));
  const usedInUC = new Set(
    asArray(pack.use_cases).flatMap((uc) =>
      // support both `requirement` (singular) and `requirements` (plural)
      asArray(uc.requirements || (uc.requirement ? [uc.requirement] : []))
    )
  );
  const usedInSCN = new Set(
    asArray(pack.scenarios)
      .map((s) => s.requirement)
      .filter(Boolean)
  );
  const usedInAC = new Set(
    asArray(pack.api_contracts)
      .map((ac) => ac.requirement)
      .filter(Boolean)
  );
  const usedInCDT = new Set(
    asArray(pack.consumer_driven_tests)
      .map((cdt) => cdt.requirement)
      .filter(Boolean)
  );
  const usedInBCR = new Set(
    asArray(pack.breaking_change_rules)
      .map((bcr) => bcr.requirement)
      .filter(Boolean)
  );
  for (const id of reqIds) {
    if (
      !usedInUC.has(id) &&
      !usedInSCN.has(id) &&
      !usedInAC.has(id) &&
      !usedInCDT.has(id) &&
      !usedInBCR.has(id)
    ) {
      errors.push(`REQ ${id} is not referenced by any use case, scenario, api_contract, consumer_driven_test, or breaking_change_rules entry.`);
    }
  }
}

function lintUseCaseActors(pack, _errors, warnings) {
  for (const uc of asArray(pack.use_cases)) {
    if (!uc.actor || uc.actor.trim() === "") {
      warnings.push(`UC ${uc.id} has no actor defined.`);
    }
  }
}

function lintBoundedContextAggregates(pack, errors, _warnings) {
  const bcIds = new Set(asArray(pack.bounded_contexts).map((bc) => bc.id));
  for (const agg of asArray(pack.aggregates)) {
    if (agg.bounded_context && !bcIds.has(agg.bounded_context)) {
      errors.push(
        `Aggregate ${agg.id || agg.name} references unknown bounded_context: ${agg.bounded_context}`
      );
    }
  }
}

function lintEventAggregates(pack, errors, _warnings) {
  const aggNames = new Set(asArray(pack.aggregates).map((a) => a.name));
  for (const evt of asArray(pack.events)) {
    if (evt.aggregate && aggNames.size > 0 && !aggNames.has(evt.aggregate)) {
      errors.push(`Event ${evt.id || evt.name} references unknown aggregate: ${evt.aggregate}`);
    }
  }
}

function lintScenarioRefs(pack, errors, _warnings) {
  const reqIds = new Set(asArray(pack.requirements).map((r) => r.id));
  const ucIds = new Set(asArray(pack.use_cases).map((uc) => uc.id));
  for (const scn of asArray(pack.scenarios)) {
    if (scn.requirement && !reqIds.has(scn.requirement)) {
      errors.push(`Scenario ${scn.id} references unknown requirement: ${scn.requirement}`);
    }
    if (scn.use_case && !ucIds.has(scn.use_case)) {
      errors.push(`Scenario ${scn.id} references unknown use_case: ${scn.use_case}`);
    }
  }
}

function lintRuleContextRefs(pack, _errors, warnings) {
  const bcIds = new Set(asArray(pack.bounded_contexts).map((bc) => bc.id));
  for (const rule of asArray(pack.rules)) {
    if (rule.context && bcIds.size > 0 && !bcIds.has(rule.context)) {
      warnings.push(
        `Rule ${rule.id} context '${rule.context}' does not match any bounded_context id.`
      );
    }
  }
}

function lintIdUniqueness(pack, errors, _warnings) {
  const sections = [
    "requirements",
    "use_cases",
    "bounded_contexts",
    "aggregates",
    "value_objects",
    "events",
    "rules",
    "scenarios",
    "commands",
  ];
  for (const section of sections) {
    const items = asArray(pack[section]);
    const seen = new Set();
    for (const item of items) {
      if (!item.id) continue;
      if (seen.has(item.id)) {
        errors.push(`Duplicate id '${item.id}' in ${section}.`);
      }
      seen.add(item.id);
    }
  }
}

function lintVariables(pack, errors, _warnings) {
  const required = asArray(pack.variables && pack.variables.required);
  for (const v of required) {
    if (typeof v !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(v)) {
      errors.push(`Variable '${v}' must be UPPER_SNAKE_CASE.`);
    }
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

function runLint(pack) {
  const errors = [];
  const warnings = [];

  lintTodos(pack, errors, warnings);
  lintIdUniqueness(pack, errors, warnings);
  lintVariables(pack, errors, warnings);
  lintRequirementsCoverage(pack, errors, warnings);
  lintUseCaseActors(pack, errors, warnings);
  lintBoundedContextAggregates(pack, errors, warnings);
  lintEventAggregates(pack, errors, warnings);
  lintScenarioRefs(pack, errors, warnings);
  lintRuleContextRefs(pack, errors, warnings);

  return { errors, warnings };
}

function main() {
  const args = process.argv.slice(3); // strip "node <script>" + "pack" sub-verb
  const opts = parseArgs(args);

  if (!opts.packRoot || !opts.packId) {
    logError("--pack-root and --pack are required.");
    usage();
    process.exit(2);
  }

  let loadResult;
  try {
    loadResult = loadPack(opts.packRoot, opts.packId);
  } catch (err) {
    logError(`Failed to load pack: ${err.message}`);
    process.exit(1);
  }

  const { pack } = loadResult;
  const { errors, warnings } = runLint(pack);

  for (const w of warnings) {
    logWarn(w);
  }
  for (const e of errors) {
    logError(e);
  }

  if (errors.length === 0 && warnings.length === 0) {
    logInfo(`Pack '${opts.packId}' passed all lint checks.`);
  } else if (errors.length === 0) {
    logInfo(`Pack '${opts.packId}' has ${warnings.length} warning(s) but no errors.`);
  } else {
    logError(`Pack '${opts.packId}' failed lint with ${errors.length} error(s).`);
    process.exit(1);
  }

  process.exit(0);
}

main();
