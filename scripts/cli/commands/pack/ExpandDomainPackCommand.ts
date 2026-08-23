import * as fs from "node:fs";
import * as path from "node:path";
import {
  asArray,
  entityLabel,
  formatList,
  hasStructuredDomainModel,
  normalizeVars,
  renderTemplate,
} from "../../../../packages/core/src/domain/PackSpec";
import {
  buildTraceabilityMarkdown,
  parseTraceabilityRows,
} from "../../../../packages/core/src/domain/TraceabilityFormat";
import {
  ensureProjectDir,
  getWrittenFiles,
  loadPack,
  readTemplate,
  resetWrittenFiles,
  safeResolve,
  validatePackModel,
  writeFile,
} from "../../../../packages/core/src/infrastructure/DiskPackRepository";
import { logError, logInfo } from "../../../../packages/core/src/infrastructure/ConsoleReporter";
import { parseArgs } from "./pack-args";
import { resolveRemotePack } from "../../../../packages/core/src/infrastructure/RemotePackResolver";
import { readLock, writeLock, upsertPackEntry, newLock } from "../../../specops/lock";
import {
  computePackDigest,
  readSecurityPolicy,
  verifyTagSignature,
  assertDigestUnchanged,
} from "../../../specops/verify";
import { snapshotBaseline } from "../../../specops/manifest";
import { BaseCommand } from "../../../lib/command";

import { findCliRoot } from "../../../lib/project-root";

const PACKAGE_VERSION = (() => {
  try {
    return require(path.join(findCliRoot(__dirname), "package.json")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  csda expand --pack-root <path> --pack <domain/type> --project-dir <path> [--var KEY=VALUE]... [--dry-run] [--no-examples]\n" +
      "  csda expand --pack-repo <git-url> --pack-version <tag> --pack <pack-id> --project-dir <path> [--var KEY=VALUE]... [--cache-dir <path>] [--dry-run]\n\n" +
      "Examples:\n" +
      '  csda expand --pack-root ./domain-packs --pack parking-management/backend --project-dir ./projects/smart-parking --var PROJECT_NAME="Smart Parking" --var PROJECT_SLUG=smart-parking --var DOMAIN="parking operations"\n' +
      '  csda expand --pack-repo https://github.com/rsaglobaltech/parking-management-specops.git --pack-version v0.1.0 --pack backend --project-dir ./smart-parking --var PROJECT_NAME="Smart Parking" --var PROJECT_SLUG=smart-parking --var DOMAIN="parking operations"\n'
  );
}

export function renderStaticFiles(
  pack: any,
  packRoot: string,
  projectDir: string,
  vars: any,
  dryRun: boolean
) {
  for (const fileDef of pack.outputs.files) {
    const template = readTemplate(packRoot, fileDef.template);
    const rendered = renderTemplate(template, vars);
    const target = safeResolve(projectDir, fileDef.target);
    writeFile(target, `${rendered.trimEnd()}\n`, dryRun);
  }
}

export function renderScenarios(
  pack: any,
  packRoot: string,
  projectDir: string,
  vars: any,
  dryRun: boolean,
  noExamples?: boolean
) {
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

function indexDomainItems(pack: any, key: string) {
  const map = new Map();
  for (const item of Array.isArray(pack[key]) ? pack[key] : []) {
    if (item.id) map.set(item.id, item);
    if (item.name) map.set(item.name, item);
  }
  return map;
}

function firstRef(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function resolveLabel(map: Map<string, any>, ref: any, fallback = "-") {
  if (!ref) return fallback;
  return entityLabel(map.get(String(ref)), String(ref));
}

function renderMarkdownTable(headers: string[], rows: string[][]) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

export function renderDomainDocs(pack: any, projectDir: string, dryRun: boolean) {
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

  const boundedContextRows = boundedContexts.map((context: any) => [
    context.id || "-",
    context.name || "-",
    context.type || "-",
    context.responsibility || "-",
    formatList(
      asArray(context.aggregates).map((ref: any) => resolveLabel(aggregateIndex, ref, ref))
    ),
  ]);

  // `bounded_context` first, then `context`: the eleven curated packs write the
  // former and the schema used to say the latter, so reading only `context`
  // rendered an empty column for every one of them. Measured — installing the
  // billing pack produced `| AGG-001 | Invoice | - | - |` while the pack
  // declared both fields under their real names (E1 / H13).
  //
  // Responsibilities and invariants are different things and get their own
  // columns: what an aggregate owns is not the same as the rules it must keep,
  // and showing one under the other's heading would be a mislabelled fact
  // rather than a missing one.
  const aggregateRows = aggregates.map((aggregate: any) => [
    aggregate.id || "-",
    aggregate.name || "-",
    aggregate.bounded_context || aggregate.context || "-",
    formatList(aggregate.responsibilities),
    formatList(aggregate.invariants),
  ]);

  const valueObjectRows = valueObjects.map((valueObject: any) => [
    valueObject.id || "-",
    valueObject.name || "-",
    formatList(valueObject.fields),
    formatList(valueObject.invariants),
  ]);

  // The aggregate that emits an event is its producer. The packs say
  // `aggregate:`, the schema said `producer:`, and the renderer read only the
  // latter — so every event in every curated pack rendered `Producer: -`.
  const eventRows = events.map((event: any) => [
    event.id || "-",
    event.name || "-",
    event.producer || event.aggregate || "-",
    formatList(event.consumers),
    formatList(event.payload),
  ]);

  const useCaseRows = useCases.map((useCase: any) => {
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
      formatList(asArray(useCase.emits).map((ref: any) => resolveLabel(eventIndex, ref, ref))),
      useCase.status || "Draft",
    ];
  });

  const commandRows = commands.map((command: any) => [
    command.id || "-",
    command.name || "-",
    command.use_case || command.useCase || "-",
    formatList(command.fields),
  ]);

  const queryRows = queries.map((query: any) => [
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
        renderMarkdownTable(
          ["ID", "Aggregate", "Context", "Responsibilities", "Invariants"],
          aggregateRows
        ),
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
        renderMarkdownTable(
          ["ID", "Aggregate", "Context", "Responsibilities", "Invariants"],
          aggregateRows
        ),
        "",
      ].join("\n"),
    ],
  ]);

  for (const [target, content] of docs.entries()) {
    writeFile(safeResolve(projectDir, target), content, dryRun);
  }
}

export function renderTraceability(
  pack: any,
  projectDir: string,
  generatedScenarios: any[],
  dryRun: boolean
) {
  const traceTarget = safeResolve(projectDir, pack.rules.traceability.target);

  let rows: any[] = [];
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
    rows = rows.map((row: any) => {
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
    rows.map((row: any) => {
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
        event: formatList(eventRefs.map((ref: any) => resolveLabel(events, ref, ref))),
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

export function resolvePackSource(args: any) {
  const hasRemote = Boolean(args.packRepo);
  const hasLocal = Boolean(args.packRoot);

  if (hasRemote && hasLocal) {
    throw new Error("Specify either --pack-root or --pack-repo, not both.");
  }

  if (hasRemote) {
    if (!args.packVersion) {
      throw new Error("--pack-repo requires --pack-version <tag-or-sha> for reproducibility.");
    }
    logInfo(`Resolving remote pack ${args.packRepo}@${args.packVersion}…`);
    const resolved = resolveRemotePack({
      repo: args.packRepo,
      version: args.packVersion,
      cacheDir: args.cacheDir || undefined,
    });
    logInfo(
      `${resolved.cached ? "Reused cached" : "Cloned"} pack at ${resolved.packRoot} ` +
        `(commit ${resolved.commit.slice(0, 7)})`
    );
    return {
      packRoot: resolved.packRoot,
      remote: {
        repo: args.packRepo,
        version: args.packVersion,
        commit: resolved.commit,
      },
    };
  }

  return { packRoot: args.packRoot, remote: null };
}

export function enforcePackSecurity(
  projectDir: string,
  packId: string,
  packDir: string,
  source: any
) {
  const digest = computePackDigest(packDir);
  if (!source.remote) return digest;

  const lock = readLock(projectDir);
  const prev =
    lock && lock.packs.find((p: any) => p.repo === source.remote.repo && p.pack_id === packId);
  assertDigestUnchanged(prev, packId, source.remote.version, digest);

  const policy = readSecurityPolicy(projectDir);
  if (policy.requireSignedPacks) {
    const sig = verifyTagSignature(source.packRoot, source.remote.version);
    if (!sig.verified) {
      throw new Error(
        `require_signed_packs is enabled but ${source.remote.repo}@${source.remote.version} ` +
          "has no valid GPG signature (checked the tag, then the commit).\n" +
          "Fix: have the pack maintainer publish signed tags (git tag -s) and import " +
          "their public key, or disable require_signed_packs in specops.config.yaml."
      );
    }
    logInfo(`Signature verified via git verify-${sig.method} for ${source.remote.version}.`);
  }
  return digest;
}

export function updateLockfile(
  projectDir: string,
  packId: string,
  remote: any,
  vars: any,
  dryRun: boolean,
  digest: string
) {
  if (!remote) return;
  const existing = readLock(projectDir) || newLock(PACKAGE_VERSION);
  existing.csda_version = PACKAGE_VERSION;
  const updated = upsertPackEntry(existing, {
    repo: remote.repo,
    version: remote.version,
    commit: remote.commit,
    digest,
    pack_id: packId,
    expanded_at: new Date().toISOString(),
    vars: { ...(vars || {}) },
  });
  const result = writeLock(projectDir, updated, { dryRun });
  logInfo(`${dryRun ? "[dry-run] would write" : "Wrote"} ${result.path}`);
}

export function updateBaseline(projectDir: string, packId: string, remote: any, dryRun: boolean) {
  if (!remote) return;
  const entries = getWrittenFiles().map((written) => ({
    rel: path.relative(projectDir, written.file).split(path.sep).join("/"),
    content: written.content,
  }));
  const result = snapshotBaseline(
    projectDir,
    packId,
    entries,
    { version: remote.version },
    { dryRun }
  );
  if (result.written) {
    logInfo(`Recorded baseline for ${result.count} file(s) under .specops/baseline/${packId}`);
  }
}

export class ExpandDomainPackCommand extends BaseCommand {
  public execute(): void {
    try {
      const rawArgs = this.args[0] === "expand" ? this.args.slice(1) : this.args;
      const args = parseArgs(rawArgs);

      if (!args.pack || !args.projectDir) {
        usage();
        process.exit(2);
      }
      if (!args.packRoot && !args.packRepo) {
        usage();
        process.exit(2);
      }

      const source = resolvePackSource(args);
      const { pack, packRoot, packFile } = loadPack(source.packRoot, args.pack);
      const { requiredVars } = validatePackModel(pack, packRoot);
      const vars = normalizeVars(requiredVars, args.vars);

      ensureProjectDir(args.projectDir, args.dryRun);

      const digest = enforcePackSecurity(args.projectDir, args.pack, packRoot, source);

      logInfo(`Using pack: ${packFile}`);
      resetWrittenFiles();
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
      updateLockfile(args.projectDir, args.pack, source.remote, vars, args.dryRun, digest);
      updateBaseline(args.projectDir, args.pack, source.remote, args.dryRun);

      logInfo(`Generated ${generated.length} scenario file(s).`);
      logInfo("Domain pack expansion completed.");
      process.exit(0);
    } catch (error: any) {
      logError(error.message);
      process.exit(1);
    }
  }
}
