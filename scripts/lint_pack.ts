#!/usr/bin/env node
"use strict";

/**
 * pack lint — semantic validation of a pack.yaml beyond JSON Schema.
 *
 * Usage:
 *   create-spec-driven-app pack lint --pack-root <path> --pack <domain/type>
 */

const fs = require("node:fs");
const path = require("node:path");
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
      "  create-spec-driven-app pack lint --pack-root <path> --pack <domain/type> [--strict]\n\n" +
      "Options:\n" +
      "  --pack-root   Root directory containing domain packs (required)\n" +
      "  --pack        Pack identifier, e.g. parking-management/backend (required)\n" +
      "  --strict      Promote scenario-quality warnings to errors. Use in CI and\n" +
      "                before a pack feeds `harness run` — a weak scenario is a\n" +
      "                weak reward signal.\n"
  );
}

function parseArgs(argv) {
  const opts: any = { packRoot: null, packId: null, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pack-root" && argv[i + 1]) {
      opts.packRoot = argv[++i];
    } else if (a === "--pack" && argv[i + 1]) {
      opts.packId = argv[++i];
    } else if (a === "--strict") {
      opts.strict = true;
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
      errors.push(
        `REQ ${id} is not referenced by any use case, scenario, api_contract, consumer_driven_test, or breaking_change_rules entry.`
      );
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

// ── Scenario-quality lint rules ───────────────────────────────────────────────
//
// A pack's scenarios are the reward signal for `harness run`: weak Gherkin
// lets the harness wave through weak code. These rules flag vague or thin
// scenarios so the signal stays honest. They feed `scenarioIssues`, which
// `--strict` promotes from warnings to errors.

// Words that signal a non-falsifiable step — an assertion that cannot fail.
const VAGUE_STEP_RE =
  /\b(works?|correctly|properly|as expected|should be fine|should work|somehow|something|some stuff|etc\.?|tbd|todo)\b|\.\.\./i;

const STEP_RE = /^\s*(Given|When|Then|And|But)\b\s*(.*)$/i;

/**
 * Parse one Gherkin feature file into a flat list of scenarios. Intentionally
 * light — enough to judge structure and step language, not a full parser.
 */
function parseFeature(content) {
  const scenarios = [];
  let current = null;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const scenarioMatch = line.match(/^(Scenario Outline|Scenario):\s*(.*)$/i);
    if (scenarioMatch) {
      current = {
        outline: /outline/i.test(scenarioMatch[1]),
        title: scenarioMatch[2].trim(),
        steps: [],
        hasExamples: false,
      };
      scenarios.push(current);
      continue;
    }
    if (!current) continue;

    if (/^Examples:/i.test(line)) {
      current.hasExamples = true;
      continue;
    }
    const stepMatch = line.match(STEP_RE);
    if (stepMatch) {
      // `And`/`But` inherit the previous keyword's role.
      let keyword = stepMatch[1].toLowerCase();
      if ((keyword === "and" || keyword === "but") && current.steps.length > 0) {
        keyword = current.steps[current.steps.length - 1].keyword;
      }
      current.steps.push({ keyword, text: stepMatch[2].trim() });
    }
  }
  return scenarios;
}

function isGenericTitle(title) {
  if (!title) return true;
  if (/^(test|scenario|example|untitled)\b/i.test(title)) return true;
  return title.split(/\s+/).filter(Boolean).length < 3;
}

/** Apply the quality checks to one parsed scenario (template- or inline-sourced). */
function checkGherkin(where, gherkin, errors, scenarioIssues) {
  const kinds = new Set(gherkin.steps.map((s) => s.keyword));

  if (isGenericTitle(gherkin.title)) {
    scenarioIssues.push(`${where}: scenario title is generic — name the behaviour under test.`);
  }
  if (gherkin.steps.length < 3) {
    scenarioIssues.push(
      `${where}: only ${gherkin.steps.length} step(s) — a real scenario needs Given/When/Then.`
    );
  }
  if (!kinds.has("when")) {
    scenarioIssues.push(`${where}: no When step — the scenario exercises no action.`);
  }
  if (!kinds.has("then")) {
    scenarioIssues.push(`${where}: no Then step — the scenario asserts nothing.`);
  }
  if (gherkin.outline && !gherkin.hasExamples) {
    // A Scenario Outline with no Examples never runs — hard error.
    errors.push(`${where}: Scenario Outline has no Examples table.`);
  }
  for (const step of gherkin.steps) {
    if (VAGUE_STEP_RE.test(step.text)) {
      scenarioIssues.push(
        `${where}: vague step "${step.keyword} ${step.text}" — make it concrete and falsifiable.`
      );
    }
  }
}

/** Build a synthetic gherkin object from inline given/when/then fields. */
function inlineGherkin(scn) {
  const steps = [];
  for (const keyword of ["given", "when", "then"]) {
    for (const text of asArray(scn[keyword])) {
      if (typeof text === "string" && text.trim()) steps.push({ keyword, text: text.trim() });
    }
  }
  return { title: scn.title || scn.scenario || "", steps, outline: false, hasExamples: true };
}

function lintScenarioQuality(pack, packRoot, errors, scenarioIssues) {
  for (const scn of asArray(pack.scenarios)) {
    const label = scn.id || scn.title || scn.scenario || "(unnamed scenario)";

    // Format 1 — inline given/when/then fields on the scenario entry.
    if (!scn.template && (scn.given || scn.when || scn.then)) {
      checkGherkin(
        `${label} → "${scn.title || "(no title)"}"`,
        inlineGherkin(scn),
        errors,
        scenarioIssues
      );
      continue;
    }

    // Format 2 — a Gherkin template file.
    if (!scn.template) {
      scenarioIssues.push(
        `Scenario ${label} declares no scenario content (template file or given/when/then).`
      );
      continue;
    }
    const templatePath = path.resolve(packRoot, scn.template);
    if (!fs.existsSync(templatePath)) {
      // A broken template link is unambiguously an error, never a warning.
      errors.push(`Scenario ${label} template not found: ${scn.template}`);
      continue;
    }

    const parsed = parseFeature(fs.readFileSync(templatePath, "utf8"));
    if (parsed.length === 0) {
      scenarioIssues.push(`Scenario ${label} (${scn.template}) contains no Gherkin scenario.`);
      continue;
    }

    for (const gherkin of parsed) {
      checkGherkin(
        `${label} → "${gherkin.title || "(no title)"}"`,
        gherkin,
        errors,
        scenarioIssues
      );
    }

    // Drift between the pack.yaml scenario name and the template's title.
    if (
      scn.scenario &&
      parsed.length === 1 &&
      parsed[0].title &&
      scn.scenario.trim() !== parsed[0].title.trim()
    ) {
      scenarioIssues.push(
        `${label}: pack.yaml scenario "${scn.scenario}" does not match template title "${parsed[0].title}".`
      );
    }
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

function runLint(pack, packRoot, opts: any = {}) {
  const errors = [];
  const warnings = [];
  const scenarioIssues = [];

  lintTodos(pack, errors, warnings);
  lintIdUniqueness(pack, errors, warnings);
  lintVariables(pack, errors, warnings);
  lintRequirementsCoverage(pack, errors, warnings);
  lintUseCaseActors(pack, errors, warnings);
  lintBoundedContextAggregates(pack, errors, warnings);
  lintEventAggregates(pack, errors, warnings);
  lintScenarioRefs(pack, errors, warnings);
  lintRuleContextRefs(pack, errors, warnings);
  lintScenarioQuality(pack, packRoot, errors, scenarioIssues);

  // --strict promotes scenario-quality findings to errors; otherwise warnings.
  if (opts.strict) {
    errors.push(...scenarioIssues);
  } else {
    warnings.push(...scenarioIssues);
  }

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

  const { pack, packRoot } = loadResult;
  const { errors, warnings } = runLint(pack, packRoot, { strict: opts.strict });

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

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  parseFeature,
  isGenericTitle,
  lintScenarioQuality,
  runLint,
};
