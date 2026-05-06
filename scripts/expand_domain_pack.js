#!/usr/bin/env node

const fs = require('node:fs');
const {
  buildTraceabilityMarkdown,
  ensureProjectDir,
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
  writeFile
} = require('./domain-pack/common');

function usage() {
  process.stdout.write(
    'Usage:\n' +
    '  create-spec-driven-app expand --pack-root <path> --pack <domain/type> --project-dir <path> [--var KEY=VALUE]... [--dry-run] [--no-examples]\n\n' +
    'Example:\n' +
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

function renderTraceability(pack, projectDir, generatedScenarios, dryRun) {
  const traceTarget = safeResolve(projectDir, pack.rules.traceability.target);

  let rows = [];
  const includeExisting = pack.rules.traceability.include_existing_rows !== false;
  if (includeExisting && fs.existsSync(traceTarget)) {
    rows = parseTraceabilityRows(fs.readFileSync(traceTarget, 'utf8'));
  }

  const rowKeys = new Set(rows.map((row) => `${row[0]}::${row[1]}`));

  for (const scenario of generatedScenarios) {
    const featureCell = `\`${scenario.target}\``;
    const scenarioCell = scenario.scenario;
    const artifactCell = scenario.technical_artifact;
    const statusCell = scenario.status || pack.rules.traceability.default_status || 'Draft';

    const key = `${featureCell}::${scenarioCell}`;
    if (!rowKeys.has(key)) {
      rows.push([featureCell, scenarioCell, artifactCell, statusCell]);
      rowKeys.add(key);
    }
  }

  const markdown = buildTraceabilityMarkdown(rows);
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
    const generated = renderScenarios(pack, packRoot, args.projectDir, vars, args.dryRun, args.noExamples);
    renderTraceability(pack, args.projectDir, generated, args.dryRun);

    logInfo(`Generated ${generated.length} scenario file(s).`);
    logInfo('Domain pack expansion completed.');
  } catch (error) {
    logError(error.message);
    process.exit(1);
  }
}

main();
