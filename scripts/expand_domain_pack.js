#!/usr/bin/env node

const fs = require("node:fs");
const {
  asArray,
  buildTraceabilityMarkdown,
  entityLabel,
  ensureProjectDir,
  formatList,
  hasStructuredDomainModel,
  loadPack,
  logError,
  logInfo,
  normalizeVars,
  parseArgs,
  parseTraceabilityRows,
  readTemplate,
  renderTemplate,
  safeResolve,
  validatePackModel,
  writeFile,
} = require("./domain-pack/common");

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  create-spec-driven-app expand --pack-root <path> --pack <domain/type> --project-dir <path> [--var KEY=VALUE]... [--dry-run] [--no-examples]\n\n" +
      "Example:\n" +
      '  create-spec-driven-app expand --pack-root ./domain-packs --pack parking-management/backend --project-dir ./projects/smart-parking --var PROJECT_NAME="Smart Parking" --var PROJECT_SLUG=smart-parking --var DOMAIN="parking operations"\n'
  );
}

function renderStaticFiles(pack, packRoot, projectDir, vars, dryRun) {
  for (const fileDef of pack.outputs.files) {
    const template = readTemplate(packRoot, fileDef.template);
    const rendered = renderTemplate(template, vars);
    const target = safeResolve(projectDir, fileDef.target);
    writeFile(target, `${rendered.trimEnd()}\n`, dryRun);
  }
}

function renderScenarios(pack, packRoot, projectDir, vars, dryRun, noExamples) {
  const generated = [];

  for (const scenario of pack.scenarios || []) {
    const isSeed = scenario.seed !== false;
    if (noExamples && isSeed) {
      logInfo(`[skip] seeded scenario '${scenario.id}' due to --no-examples`);
      continue;
    }

    const template = readTemplate(packRoot, scenario.template);
    const rendered = renderTemplate(template, vars);
    const target = safeResolve(projectDir, scenario.target);
    writeFile(target, `${rendered.trimEnd()}\n`, dryRun);

    generated.push(scenario);
  }

  return generated;
}

function indexDomainItems(pack, key) {
  const map = new Map();
  for (const item of Array.isArray(pack[key]) ? pack[key] : []) {
    if (item.id) map.set(item.id, item);
    if (item.name) map.set(item.name, item);
  }
  return map;
}

function firstRef(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function resolveLabel(map, ref, fallback = "-") {
  if (!ref) return fallback;
  return entityLabel(map.get(String(ref)), String(ref));
}

function renderMarkdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function renderDomainDocs(pack, projectDir, dryRun) {
  if (!hasStructuredDomainModel(pack)) {
    return;
  }

  const boundedContexts = Array.isArray(pack.bounded_contexts) ? pack.bounded_contexts : [];
  const aggregates = Array.isArray(pack.aggregates) ? pack.aggregates : [];
  const valueObjects = Array.isArray(pack.value_objects) ? pack.value_objects : [];
  const events = Array.isArray(pack.events) ? pack.events : [];
  const useCases = Array.isArray(pack.use_cases) ? pack.use_cases : [];
  const commands = Array.isArray(pack.commands) ? pack.commands : [];
  const queries = Array.isArray(pack.queries) ? pack.queries : [];

  const aggregateIndex = indexDomainItems(pack, "aggregates");
  const commandIndex = indexDomainItems(pack, "commands");
  const queryIndex = indexDomainItems(pack, "queries");
  const eventIndex = indexDomainItems(pack, "events");

  const boundedContextRows = boundedContexts.map((context) => [
    context.id || "-",
    context.name || "-",
    context.type || "-",
    context.responsibility || "-",
    formatList(asArray(context.aggregates).map((ref) => resolveLabel(aggregateIndex, ref, ref))),
  ]);

  const aggregateRows = aggregates.map((aggregate) => [
    aggregate.id || "-",
    aggregate.name || "-",
    aggregate.context || "-",
    formatList(aggregate.invariants),
  ]);

  const valueObjectRows = valueObjects.map((valueObject) => [
    valueObject.id || "-",
    valueObject.name || "-",
    formatList(valueObject.fields),
    formatList(valueObject.invariants),
  ]);

  const eventRows = events.map((event) => [
    event.id || "-",
    event.name || "-",
    event.producer || "-",
    formatList(event.consumers),
    formatList(event.payload),
  ]);

  const useCaseRows = useCases.map((useCase) => {
    const commandOrQuery = firstRef(useCase.command, useCase.query);
    const commandOrQueryLabel = useCase.command
      ? resolveLabel(commandIndex, useCase.command, useCase.command)
      : resolveLabel(queryIndex, useCase.query, commandOrQuery || "-");

    return [
      useCase.id || "-",
      useCase.name || "-",
      useCase.actor || "-",
      useCase.requirement || "-",
      commandOrQueryLabel,
      useCase.aggregate || "-",
      formatList(asArray(useCase.emits).map((ref) => resolveLabel(eventIndex, ref, ref))),
      useCase.status || "Draft",
    ];
  });

  const commandRows = commands.map((command) => [
    command.id || "-",
    command.name || "-",
    command.use_case || command.useCase || "-",
    formatList(command.fields),
  ]);

  const queryRows = queries.map((query) => [
    query.id || "-",
    query.name || "-",
    query.use_case || query.useCase || "-",
    formatList(query.returns || query.fields),
  ]);

  const docs = new Map([
    [
      "docs/specs/domain-model.md",
      [
        "# Domain Model",
        "",
        "## Bounded Contexts",
        "",
        renderMarkdownTable(
          ["ID", "Name", "Type", "Responsibility", "Aggregates"],
          boundedContextRows
        ),
        "",
        "## Aggregates",
        "",
        renderMarkdownTable(["ID", "Aggregate", "Context", "Invariants"], aggregateRows),
        "",
        "## Value Objects",
        "",
        renderMarkdownTable(["ID", "Value Object", "Fields", "Invariants"], valueObjectRows),
        "",
        "## Domain Events",
        "",
        renderMarkdownTable(["ID", "Event", "Producer", "Consumers", "Payload"], eventRows),
        "",
      ].join("\n"),
    ],
    [
      "docs/specs/use-cases.md",
      [
        "# Use Cases",
        "",
        renderMarkdownTable(
          [
            "ID",
            "Use Case",
            "Actor",
            "Requirement",
            "Command/Query",
            "Aggregate",
            "Emits",
            "Status",
          ],
          useCaseRows
        ),
        "",
      ].join("\n"),
    ],
    [
      "docs/specs/commands.md",
      [
        "# Commands and Queries",
        "",
        "## Commands",
        "",
        renderMarkdownTable(["ID", "Command", "Use Case", "Fields"], commandRows),
        "",
        "## Queries",
        "",
        renderMarkdownTable(["ID", "Query", "Use Case", "Returns"], queryRows),
        "",
      ].join("\n"),
    ],
    [
      "docs/specs/events.md",
      [
        "# Domain Events",
        "",
        renderMarkdownTable(["ID", "Event", "Producer", "Consumers", "Payload"], eventRows),
        "",
      ].join("\n"),
    ],
    [
      "docs/specs/aggregates.md",
      [
        "# Aggregates",
        "",
        renderMarkdownTable(["ID", "Aggregate", "Context", "Invariants"], aggregateRows),
        "",
      ].join("\n"),
    ],
  ]);

  for (const [target, content] of docs.entries()) {
    writeFile(safeResolve(projectDir, target), content, dryRun);
  }
}

function renderTraceability(pack, projectDir, generatedScenarios, dryRun) {
  const traceTarget = safeResolve(projectDir, pack.rules.traceability.target);

  let rows = [];
  let mode = hasStructuredDomainModel(pack) ? "rich" : "legacy";
  const includeExisting = pack.rules.traceability.include_existing_rows !== false;
  if (includeExisting && fs.existsSync(traceTarget)) {
    const parsed = parseTraceabilityRows(fs.readFileSync(traceTarget, "utf8"));
    rows = parsed.rows;
    if (parsed.mode === "rich") {
      mode = "rich";
    }
  }

  if (mode === "rich") {
    rows = rows.map((row) => {
      if (!row.feature) return row;
      return {
        requirement: "-",
        scenarioId: "-",
        featureFile: row.feature,
        useCase: "-",
        commandOrQuery: "-",
        aggregate: "-",
        event: "-",
        technicalArtifact: row.technicalArtifact,
        testArtifact: "-",
        status: row.status || "Draft",
      };
    });
  }

  const requirements = indexDomainItems(pack, "requirements");
  const useCases = indexDomainItems(pack, "use_cases");
  const commands = indexDomainItems(pack, "commands");
  const queries = indexDomainItems(pack, "queries");
  const aggregates = indexDomainItems(pack, "aggregates");
  const events = indexDomainItems(pack, "events");

  const rowKeys = new Set(
    rows.map((row) => {
      if (mode === "rich") return `${row.featureFile}::${row.scenarioId}`;
      return `${row.feature}::${row.scenario}`;
    })
  );

  for (const scenario of generatedScenarios) {
    const featureCell = `\`${scenario.target}\``;
    const statusCell = scenario.status || pack.rules.traceability.default_status || "Draft";

    if (mode === "rich") {
      const useCase = useCases.get(scenario.use_case);
      const commandRef = firstRef(scenario.command, useCase && useCase.command);
      const queryRef = firstRef(scenario.query, useCase && useCase.query);
      const aggregateRef = firstRef(scenario.aggregate, useCase && useCase.aggregate);
      const requirementRef = firstRef(scenario.requirement_id, useCase && useCase.requirement);
      const eventRefs =
        asArray(scenario.events).length > 0
          ? asArray(scenario.events)
          : asArray(useCase && useCase.emits);

      const row = {
        requirement: resolveLabel(requirements, requirementRef, requirementRef || "-"),
        scenarioId: scenario.id,
        featureFile: featureCell,
        useCase: entityLabel(useCase, scenario.use_case || "-"),
        commandOrQuery: commandRef
          ? resolveLabel(commands, commandRef, commandRef)
          : resolveLabel(queries, queryRef, queryRef || "-"),
        aggregate: resolveLabel(aggregates, aggregateRef, aggregateRef || "-"),
        event: formatList(eventRefs.map((ref) => resolveLabel(events, ref, ref))),
        technicalArtifact: formatList(scenario.technical_artifacts || scenario.technical_artifact),
        testArtifact: formatList(scenario.test_artifacts || scenario.test_artifact, "TBD"),
        status: statusCell,
      };

      const key = `${row.featureFile}::${row.scenarioId}`;
      if (!rowKeys.has(key)) {
        rows.push(row);
        rowKeys.add(key);
      }
      continue;
    }

    const row = {
      feature: featureCell,
      scenario: scenario.scenario,
      technicalArtifact: formatList(scenario.technical_artifact || scenario.technical_artifacts),
      status: statusCell,
    };

    const key = `${row.feature}::${row.scenario}`;
    if (!rowKeys.has(key)) {
      rows.push(row);
      rowKeys.add(key);
    }
  }

  const markdown = buildTraceabilityMarkdown(rows, mode);
  writeFile(traceTarget, markdown, dryRun);
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));

    if (!args.packRoot || !args.pack || !args.projectDir) {
      usage();
      process.exit(2);
    }

    const { pack, packRoot, packFile } = loadPack(args.packRoot, args.pack);
    const { requiredVars } = validatePackModel(pack, packRoot);
    const vars = normalizeVars(requiredVars, args.vars);

    ensureProjectDir(args.projectDir, args.dryRun);

    logInfo(`Using pack: ${packFile}`);
    renderStaticFiles(pack, packRoot, args.projectDir, vars, args.dryRun);
    const generated = renderScenarios(
      pack,
      packRoot,
      args.projectDir,
      vars,
      args.dryRun,
      args.noExamples
    );
    renderDomainDocs(pack, args.projectDir, args.dryRun);
    renderTraceability(pack, args.projectDir, generated, args.dryRun);

    logInfo(`Generated ${generated.length} scenario file(s).`);
    logInfo("Domain pack expansion completed.");
  } catch (error) {
    logError(error.message);
    process.exit(1);
  }
}

main();
