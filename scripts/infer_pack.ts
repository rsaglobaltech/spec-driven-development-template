#!/usr/bin/env node
"use strict";

/**
 * `pack infer` — invert the authoring flow.
 *
 * Instead of writing the model (requirements → use cases → commands →
 * events) and then the `.feature` scenarios, write the `.feature` first and
 * let this command propose a pack.yaml skeleton from it. That kills the
 * waterfall smell: the executable scenario leads, the model follows.
 *
 * The inference is deliberately HEURISTIC and deterministic — no LLM, no
 * network, no vendor dependency. It produces a skeleton full of `TODO:`
 * markers that a pack author reviews and fills in. An LLM-assisted mode
 * (shell-out, vendor-neutral — same pattern as `harness run`) is a possible
 * follow-up behind a `--llm` flag.
 *
 * Usage:
 *   create-spec-driven-app pack infer --from <feature-file> [--format yaml|json]
 */

const fs = require("node:fs");

function logError(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  create-spec-driven-app pack infer --from <feature-file> [--format yaml|json]\n\n" +
      "Reads a Gherkin .feature file and prints a proposed pack.yaml fragment\n" +
      "(requirements, use_cases, commands, events, scenarios) to stdout. The\n" +
      "output is a heuristic skeleton — review every TODO before merging.\n\n" +
      "Options:\n" +
      "  --from <path>     Gherkin .feature file to infer from (required)\n" +
      "  --format <fmt>    Output format: yaml (default) or json\n"
  );
}

function parseArgs(argv) {
  const opts: any = { from: null, format: "yaml" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from" && argv[i + 1]) {
      opts.from = argv[++i];
    } else if (a === "--format" && argv[i + 1]) {
      opts.format = argv[++i];
    } else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
  }
  if (!["yaml", "json"].includes(opts.format)) {
    logError(`Invalid --format: ${opts.format}. Expected: yaml | json.`);
    process.exit(2);
  }
  return opts;
}

// ── Gherkin parsing ───────────────────────────────────────────────────────────

const STEP_RE = /^(Given|When|Then|And|But)\b\s*(.*)$/i;

/**
 * Parse a .feature file: the feature name, feature-level tags, and each
 * scenario with its tags and steps (And/But inherit the prior keyword).
 */
function parseFeatureFile(content) {
  const featureTags = [];
  const scenarios = [];
  let featureName = "";
  let pendingTags = [];
  let current = null;

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("@")) {
      pendingTags.push(...line.split(/\s+/).filter((t) => t.startsWith("@")));
      continue;
    }

    const featureMatch = line.match(/^Feature:\s*(.*)$/i);
    if (featureMatch) {
      featureName = featureMatch[1].trim();
      featureTags.push(...pendingTags);
      pendingTags = [];
      continue;
    }

    const scenarioMatch = line.match(/^(?:Scenario Outline|Scenario):\s*(.*)$/i);
    if (scenarioMatch) {
      current = { title: scenarioMatch[1].trim(), tags: pendingTags.slice(), steps: [] };
      scenarios.push(current);
      pendingTags = [];
      continue;
    }

    const stepMatch = line.match(STEP_RE);
    if (stepMatch && current) {
      let keyword = stepMatch[1].toLowerCase();
      if ((keyword === "and" || keyword === "but") && current.steps.length > 0) {
        keyword = current.steps[current.steps.length - 1].keyword;
      }
      current.steps.push({ keyword, text: stepMatch[2].trim() });
      continue;
    }

    // Any other content line drops tags that were not consumed by a block.
    pendingTags = [];
  }

  return { featureName, featureTags, scenarios };
}

// ── Heuristic inference ───────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(3, "0");
}

/** PascalCase the first few significant words of a step/title. */
function toPascalCase(text) {
  const words = text
    .replace(/"[^"]*"/g, "") // drop quoted literals — they are data, not intent
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^\d+$/.test(w)) // a bare number is data, not a verb/noun
    .slice(0, 4);
  if (words.length === 0) return "Action";
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
}

/** Collect REQ-NNN ids from feature/scenario tags (e.g. `@REQ-001`). */
function collectRequirementIds(parsed) {
  const ids = new Set();
  const scan = (tags) => {
    for (const tag of tags || []) {
      const m = String(tag).match(/REQ-\d+/i);
      if (m) ids.add(m[0].toUpperCase());
    }
  };
  scan(parsed.featureTags);
  for (const scn of parsed.scenarios) scan(scn.tags);
  return [...ids];
}

/** Quoted PascalCase tokens in a Then step are very likely event names. */
function extractEventNames(text) {
  const out = [];
  const re = /"([A-Z][A-Za-z0-9]+)"/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/**
 * Turn a parsed feature into a proposed pack model. Every field the heuristic
 * cannot infer is left as an explicit `TODO:` string so nothing silently
 * ships half-guessed.
 */
function inferModel(parsed, sourceFile) {
  const reqIds = collectRequirementIds(parsed);
  const requirements =
    reqIds.length > 0
      ? reqIds.map((id) => ({ id, title: `TODO: describe ${id}` }))
      : [
          {
            id: "REQ-XXX",
            title: `TODO: requirement behind "${parsed.featureName || sourceFile}"`,
          },
        ];
  const primaryReq = requirements[0].id;

  const useCase = {
    id: "UC-XXX",
    name: parsed.featureName || "TODO: name the use case",
    requirement: primaryReq,
    command: "TODO: command",
    aggregate: "TODO: aggregate",
    emits: [],
  };

  const commands = [];
  const events = [];
  const scenarios = [];
  let ci = 1;
  let ei = 1;
  let si = 1;

  for (const scn of parsed.scenarios) {
    const scnId = `SCN-${pad(si++)}`;

    // A When step is an action → propose a command.
    const whenStep = scn.steps.find((s) => s.keyword === "when");
    let commandName = null;
    if (whenStep) {
      commandName = `${toPascalCase(whenStep.text)}Command`;
      commands.push({ id: `CMD-${pad(ci++)}`, name: commandName });
    }

    // Then steps naming a quoted PascalCase token → propose events.
    const eventNames = [];
    for (const step of scn.steps.filter((s) => s.keyword === "then")) {
      for (const name of extractEventNames(step.text)) {
        if (!events.some((e) => e.name === name)) {
          events.push({ id: `EVT-${pad(ei++)}`, name });
        }
        if (!eventNames.includes(name)) eventNames.push(name);
      }
    }

    scenarios.push({
      id: scnId,
      title: scn.title,
      use_case: useCase.id,
      command: commandName || "TODO: command",
      events: eventNames,
    });
  }

  if (commands.length > 0) useCase.command = commands[0].name;
  useCase.emits = [...new Set(events.map((e) => e.name))];

  return { requirements, use_cases: [useCase], commands, events, scenarios };
}

// ── YAML fragment rendering ───────────────────────────────────────────────────

/** Quote a scalar only when YAML would otherwise misread it. */
function yamlScalar(value) {
  const s = String(value);
  if (s === "") return '""';
  if (/^[A-Za-z0-9_][A-Za-z0-9_ .\-/]*$/.test(s) && !/:\s/.test(s) && !s.includes(": ")) {
    // Still quote if it could be read as something other than a plain string.
    if (/^(true|false|null|yes|no|~|\d+(\.\d+)?)$/i.test(s)) return `"${s}"`;
    return s;
  }
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function renderYamlFragment(model, sourceFile) {
  const out = [
    `# Proposed pack.yaml fragment inferred from ${sourceFile}`,
    `# Heuristic skeleton — review and resolve every TODO before merging.`,
    "",
    "requirements:",
  ];
  for (const r of model.requirements) {
    out.push(`  - id: ${yamlScalar(r.id)}`);
    out.push(`    title: ${yamlScalar(r.title)}`);
  }
  out.push("");
  out.push("use_cases:");
  for (const u of model.use_cases) {
    out.push(`  - id: ${yamlScalar(u.id)}`);
    out.push(`    name: ${yamlScalar(u.name)}`);
    out.push(`    requirement: ${yamlScalar(u.requirement)}`);
    out.push(`    command: ${yamlScalar(u.command)}`);
    out.push(`    aggregate: ${yamlScalar(u.aggregate)}`);
    if (u.emits.length === 0) {
      out.push(`    emits: []`);
    } else {
      out.push(`    emits:`);
      for (const e of u.emits) out.push(`      - ${yamlScalar(e)}`);
    }
  }
  out.push("");
  out.push("commands:");
  if (model.commands.length === 0) out.push("  []");
  for (const c of model.commands) {
    out.push(`  - id: ${yamlScalar(c.id)}`);
    out.push(`    name: ${yamlScalar(c.name)}`);
  }
  out.push("");
  out.push("events:");
  if (model.events.length === 0) out.push("  []");
  for (const e of model.events) {
    out.push(`  - id: ${yamlScalar(e.id)}`);
    out.push(`    name: ${yamlScalar(e.name)}`);
  }
  out.push("");
  out.push("scenarios:");
  for (const s of model.scenarios) {
    out.push(`  - id: ${yamlScalar(s.id)}`);
    out.push(`    title: ${yamlScalar(s.title)}`);
    out.push(`    use_case: ${yamlScalar(s.use_case)}`);
    out.push(`    command: ${yamlScalar(s.command)}`);
    if (s.events.length === 0) {
      out.push(`    events: []`);
    } else {
      out.push(`    events:`);
      for (const e of s.events) out.push(`      - ${yamlScalar(e)}`);
    }
  }
  out.push("");
  return out.join("\n");
}

// ── Runner ────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(3)); // strip "node <script>" + "pack" sub-verb

  if (!opts.from) {
    logError("--from <feature-file> is required.");
    usage();
    process.exit(2);
  }

  let content;
  try {
    content = fs.readFileSync(opts.from, "utf8");
  } catch (err) {
    logError(`Cannot read feature file '${opts.from}': ${err.message}`);
    process.exit(1);
  }

  const parsed = parseFeatureFile(content);
  if (parsed.scenarios.length === 0) {
    logError(`No Gherkin scenarios found in '${opts.from}'.`);
    process.exit(1);
  }

  const model = inferModel(parsed, opts.from);

  if (opts.format === "json") {
    process.stdout.write(
      JSON.stringify({ schema_version: 1, source: opts.from, ...model }, null, 2) + "\n"
    );
  } else {
    process.stdout.write(renderYamlFragment(model, opts.from) + "\n");
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  parseFeatureFile,
  toPascalCase,
  collectRequirementIds,
  extractEventNames,
  inferModel,
  renderYamlFragment,
};
