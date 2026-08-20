#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Pure format knowledge — the lite YAML reader and the traceability matrix
 * reader/writer — now lives in `packages/core/src/domain`. It is re-exported
 * here so this module stays the single import site the pack tooling already
 * uses; everything below is the disk- and CLI-facing half that stayed behind.
 */
import { parseYamlLite } from "../../packages/core/src/domain/YamlLite";
export { parseYamlLite, YamlDocument, PackModel } from "../../packages/core/src/domain/YamlLite";
export {
  parseTraceabilityRows,
  buildTraceabilityMarkdown,
} from "../../packages/core/src/domain/TraceabilityFormat";

function toPosixPath(inputPath) {
  return inputPath.replace(/\\/g, "/");
}

function isSafeRelativePath(candidate) {
  if (!candidate || typeof candidate !== "string") return false;
  if (path.isAbsolute(candidate)) return false;

  const normalized = toPosixPath(path.posix.normalize(candidate));
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.includes("/../")) return false;
  return true;
}

function fail(message) {
  throw new Error(message);
}

/**
 * Highest `pack.yaml` schema this CLI can read. Bump it in the same change
 * that adds a field to `schemas/pack.schema.json`, or packs authored against
 * the new field will be rejected by a CLI that in fact understands them.
 */
export const PACK_SCHEMA_VERSION = "1.3.0";

/** Project types a pack may target. Mirrors the enum in schemas/pack.schema.json. */
export const PACK_PROJECT_TYPES = ["backend", "frontend", "mobile", "contracts"];

/**
 * Numeric SemVer comparison for schema versions — `a > b`.
 *
 * Deliberately not a SemVer library: schema versions here are always three
 * plain integers (the JSON schema enforces `^\d+\.\d+\.\d+$`), so there are no
 * pre-release or build parts to handle, and this project ships no runtime
 * dependencies.
 */
export function isNewerThan(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

export const ALLOWED_STATUSES = new Set([
  "Draft",
  "Needs Clarification",
  "Domain Reviewed",
  "Architecture Reviewed",
  "Ready for Dev",
  "In Dev",
  "In Review",
  "Verified",
  "Released",
  "Deprecated",
]);

const ALLOWED_PRIORITIES = new Set(["Must", "Should", "Could", "Won't"]);

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

export function formatList(value, fallback = "-") {
  const items = asArray(value)
    .map((item) => String(item).trim())
    .filter(Boolean);
  return items.length > 0 ? items.join(", ") : fallback;
}

export function entityLabel(entity, fallback = "-") {
  if (!entity) return fallback;
  if (typeof entity === "string") return entity;
  if (entity.id && entity.name) return `${entity.id} ${entity.name}`;
  if (entity.id) return entity.id;
  if (entity.name) return entity.name;
  return fallback;
}

export function hasStructuredDomainModel(pack) {
  return [
    "requirements",
    "bounded_contexts",
    "use_cases",
    "commands",
    "queries",
    "aggregates",
    "events",
    "value_objects",
  ].some((key) => Array.isArray(pack[key]) && pack[key].length > 0);
}

export function parseArgs(argv) {
  const args = {
    packRoot: "",
    pack: "",
    projectDir: "",
    dryRun: false,
    noExamples: false,
    vars: {},
    packRepo: "",
    packVersion: "",
    cacheDir: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--pack-root") {
      args.packRoot = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--pack") {
      args.pack = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--project-dir") {
      args.projectDir = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--pack-repo") {
      args.packRepo = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--pack-version") {
      args.packVersion = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--cache-dir") {
      args.cacheDir = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (token === "--no-examples") {
      args.noExamples = true;
      continue;
    }

    if (token === "--var") {
      const pair = argv[i + 1] || "";
      i += 1;
      const eq = pair.indexOf("=");
      if (eq < 1) {
        fail(`Invalid --var value '${pair}'. Use KEY=VALUE.`);
      }

      const key = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      args.vars[key] = value;
      continue;
    }

    fail(`Unknown argument: ${token}`);
  }

  return args;
}

export function loadPack(packRoot, packId) {
  if (!packRoot) fail("Missing --pack-root <path>.");
  if (!packId) fail("Missing --pack <domain/type>.");

  const normalizedRoot = path.resolve(packRoot);
  const normalizedPackPath = path.resolve(normalizedRoot, packId);
  const packFile = path.join(normalizedPackPath, "pack.yaml");

  if (!normalizedPackPath.startsWith(normalizedRoot)) {
    fail(`Invalid pack path '${packId}'.`);
  }

  if (!fs.existsSync(packFile)) {
    fail(`Pack file not found: ${packFile}`);
  }

  const pack = parseYamlLite(fs.readFileSync(packFile, "utf8"));

  return {
    pack,
    packFile,
    packRoot: normalizedPackPath,
  };
}

export function validatePackModel(pack, packRoot) {
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    fail("Invalid pack format. Root must be an object.");
  }

  const metadata = pack.metadata || {};
  const requiredMetadata = ["name", "version", "language", "project_type"];
  for (const key of requiredMetadata) {
    if (!metadata[key] || typeof metadata[key] !== "string") {
      fail(`metadata.${key} is required and must be a string.`);
    }
  }

  // Kept in step with the enum in schemas/pack.schema.json — the schema is the
  // authority, and the two disagreeing is what made `contracts` packs
  // scaffoldable but impossible to install.
  if (!PACK_PROJECT_TYPES.includes(metadata.project_type)) {
    fail(
      `metadata.project_type must be one of ${PACK_PROJECT_TYPES.join(", ")}. ` +
        `Found '${metadata.project_type}'.`
    );
  }

  const requiredVars =
    pack.variables && Array.isArray(pack.variables.required) ? pack.variables.required : [];

  if (requiredVars.length === 0) {
    fail("variables.required must contain at least one variable.");
  }

  for (const varName of requiredVars) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(varName)) {
      fail(`Invalid variable name in variables.required: '${varName}'.`);
    }
  }

  const outputs = pack.outputs || {};
  if (!Array.isArray(outputs.files) || outputs.files.length === 0) {
    fail("outputs.files must contain at least one file definition.");
  }

  const targets = new Set();
  const refs = {
    requirements: new Map(),
    bounded_contexts: new Map(),
    use_cases: new Map(),
    commands: new Map(),
    queries: new Map(),
    aggregates: new Map(),
    events: new Map(),
    value_objects: new Map(),
    business_rules: new Map(),
  };

  function remember(collectionName, item, label) {
    if (!item || typeof item !== "object") {
      fail(`${collectionName} entries must be objects.`);
    }

    if (!item.id || typeof item.id !== "string") {
      fail(`${collectionName} entry is missing required string field 'id'.`);
    }

    const map = refs[collectionName];
    if (map.has(item.id)) {
      fail(`Duplicate ${label} id detected: '${item.id}'.`);
    }
    map.set(item.id, item);

    if (item.name && typeof item.name === "string") {
      if (map.has(item.name)) {
        fail(`Duplicate ${label} name/reference detected: '${item.name}'.`);
      }
      map.set(item.name, item);
    }
  }

  function hasRef(collectionName, ref) {
    if (!ref) return false;
    return refs[collectionName].has(String(ref));
  }

  function assertRef(collectionName, ref, context) {
    if (!ref) return;
    if (!hasRef(collectionName, ref)) {
      fail(`${context} references unknown ${collectionName.slice(0, -1)} '${ref}'.`);
    }
  }

  function assertRefs(collectionName, values, context) {
    for (const ref of asArray(values)) {
      assertRef(collectionName, ref, context);
    }
  }

  function assertStatus(status, context) {
    if (status !== undefined && !ALLOWED_STATUSES.has(status)) {
      fail(`${context} has invalid status '${status}'.`);
    }
  }

  function assertTemplateExists(templatePath, context) {
    if (!isSafeRelativePath(templatePath)) {
      fail(`${context} template path '${templatePath}' is invalid.`);
    }

    const absolute = path.resolve(packRoot, templatePath);
    if (!absolute.startsWith(packRoot)) {
      fail(`${context} template escapes pack root: ${templatePath}`);
    }

    if (!fs.existsSync(absolute)) {
      fail(`${context} template not found: ${absolute}`);
    }
  }

  function assertTarget(target, context) {
    if (!isSafeRelativePath(target)) {
      fail(`${context} target path '${target}' is invalid.`);
    }

    if (targets.has(target)) {
      fail(`Duplicate target path detected: '${target}'.`);
    }

    targets.add(target);
  }

  for (const fileDef of outputs.files) {
    if (!fileDef || typeof fileDef !== "object") {
      fail("outputs.files entries must be objects.");
    }

    if (!fileDef.target || !fileDef.template) {
      fail("Each outputs.files entry requires target and template.");
    }

    assertTarget(fileDef.target, "outputs.files");
    assertTemplateExists(fileDef.template, `outputs.files target '${fileDef.target}'`);
  }

  if (!pack.rules || !pack.rules.traceability || !pack.rules.traceability.target) {
    fail("rules.traceability.target is required.");
  }

  if (!isSafeRelativePath(pack.rules.traceability.target)) {
    fail("rules.traceability.target must be a safe relative path.");
  }

  if (pack.schema_version !== undefined && typeof pack.schema_version !== "string") {
    fail("schema_version must be a string when provided.");
  }
  // Forward-compatibility gate. Until now `schema_version` was written by
  // `pack init` and read by nothing, so a pack authored against a newer schema
  // failed later with "unknown property X" — accurate but useless. The schema
  // sets additionalProperties:false, so a newer minor is genuinely unreadable
  // here, not merely unfamiliar; say so at the top rather than field by field.
  if (
    typeof pack.schema_version === "string" &&
    isNewerThan(pack.schema_version, PACK_SCHEMA_VERSION)
  ) {
    fail(
      `pack.yaml declares schema_version ${pack.schema_version}, but this CLI ` +
        `understands up to ${PACK_SCHEMA_VERSION}.\n` +
        "Fix: upgrade with `npm install -g create-spec-driven-app@latest`, or " +
        "pin the pack to a version that targets the older schema."
    );
  }

  for (const item of Array.isArray(pack.requirements) ? pack.requirements : []) {
    remember("requirements", item, "requirement");
    if (item.priority !== undefined && !ALLOWED_PRIORITIES.has(item.priority)) {
      fail(`Requirement '${item.id}' has invalid priority '${item.priority}'.`);
    }
    assertStatus(item.status, `Requirement '${item.id}'`);
  }

  for (const item of Array.isArray(pack.bounded_contexts) ? pack.bounded_contexts : []) {
    remember("bounded_contexts", item, "bounded context");
  }

  // Invariants the domain imposes, independent of any implementation. They
  // live under `business_rules` because `rules` is render configuration —
  // conflating the two is what left every curated pack unable to install.
  for (const item of Array.isArray(pack.business_rules) ? pack.business_rules : []) {
    remember("business_rules", item, "business rule");
    if (!item.title || typeof item.title !== "string") {
      fail(`Business rule '${item.id}' requires a title.`);
    }
  }

  for (const item of Array.isArray(pack.commands) ? pack.commands : []) {
    remember("commands", item, "command");
  }

  for (const item of Array.isArray(pack.queries) ? pack.queries : []) {
    remember("queries", item, "query");
  }

  for (const item of Array.isArray(pack.aggregates) ? pack.aggregates : []) {
    remember("aggregates", item, "aggregate");
  }

  for (const item of Array.isArray(pack.events) ? pack.events : []) {
    remember("events", item, "event");
  }

  for (const item of Array.isArray(pack.value_objects) ? pack.value_objects : []) {
    remember("value_objects", item, "value object");
  }

  for (const context of Array.isArray(pack.bounded_contexts) ? pack.bounded_contexts : []) {
    assertRefs("aggregates", context.aggregates, `Bounded context '${context.id}'`);
  }

  for (const aggregate of Array.isArray(pack.aggregates) ? pack.aggregates : []) {
    assertRef("bounded_contexts", aggregate.context, `Aggregate '${aggregate.id}'`);
  }

  for (const useCase of Array.isArray(pack.use_cases) ? pack.use_cases : []) {
    remember("use_cases", useCase, "use case");
    assertRef("requirements", useCase.requirement, `Use case '${useCase.id}'`);
    assertRef("commands", useCase.command, `Use case '${useCase.id}'`);
    assertRef("queries", useCase.query, `Use case '${useCase.id}'`);
    assertRef("aggregates", useCase.aggregate, `Use case '${useCase.id}'`);
    assertRefs("events", useCase.emits, `Use case '${useCase.id}'`);
    assertStatus(useCase.status, `Use case '${useCase.id}'`);
  }

  const scenarios = Array.isArray(pack.scenarios) ? pack.scenarios : [];
  const scenarioIds = new Set();
  for (const scenario of scenarios) {
    if (!scenario || typeof scenario !== "object") {
      fail("scenarios entries must be objects.");
    }

    // The installer's minimum: enough to render the feature file and write the
    // traceability row. Domain linkage (use_case, command, aggregate, events)
    // is optional, so a pack for a domain without CQRS is not forced to invent
    // one — but it is validated below when present.
    const requiredScenarioFields = [
      "id",
      "requirement_id",
      "target",
      "template",
      "feature",
      "scenario",
    ];

    for (const field of requiredScenarioFields) {
      if (!scenario[field] || typeof scenario[field] !== "string") {
        fail(`Scenario is missing required field '${field}'.`);
      }
    }

    if (scenarioIds.has(scenario.id)) {
      fail(`Duplicate scenario id detected: '${scenario.id}'.`);
    }
    scenarioIds.add(scenario.id);

    // Optional by design: a pack author describes the domain, not the caller's
    // implementation. Absent, the matrix renders TBD in that column — which is
    // exactly the gap `plan` reads as NEEDS_IMPLEMENTATION. Validated when it
    // is there, so a typo does not become a silent empty cell.
    if (scenario.technical_artifacts !== undefined) {
      if (
        !Array.isArray(scenario.technical_artifacts) ||
        scenario.technical_artifacts.length === 0
      ) {
        fail(`Scenario '${scenario.id}' has an empty or malformed technical_artifacts.`);
      }
    }
    if (
      scenario.technical_artifact !== undefined &&
      typeof scenario.technical_artifact !== "string"
    ) {
      fail(`Scenario '${scenario.id}' has a malformed technical_artifact.`);
    }

    if (scenario.seed !== undefined && typeof scenario.seed !== "boolean") {
      fail(`Scenario '${scenario.id}' has invalid 'seed' value. Expected boolean.`);
    }

    assertStatus(scenario.status, `Scenario '${scenario.id}'`);
    assertRef("requirements", scenario.requirement_id, `Scenario '${scenario.id}'`);
    assertRef("use_cases", scenario.use_case, `Scenario '${scenario.id}'`);
    assertRef("commands", scenario.command, `Scenario '${scenario.id}'`);
    assertRef("queries", scenario.query, `Scenario '${scenario.id}'`);
    assertRef("aggregates", scenario.aggregate, `Scenario '${scenario.id}'`);
    assertRefs("events", scenario.events, `Scenario '${scenario.id}'`);

    assertTarget(scenario.target, `scenario '${scenario.id}'`);
    assertTemplateExists(scenario.template, `scenario '${scenario.id}'`);
  }

  return {
    requiredVars,
  };
}

export function renderTemplate(content, vars) {
  return content.replace(/{{([A-Z][A-Z0-9_]*)}}/g, (_, token) => {
    if (!(token in vars)) {
      fail(`Missing variable '${token}' required by template.`);
    }
    return String(vars[token]);
  });
}

export function normalizeVars(requiredVars, providedVars) {
  const normalized = { ...providedVars };

  for (const name of requiredVars) {
    if (!(name in normalized) || normalized[name] === "") {
      fail(`Missing required variable '${name}'. Provide it using --var ${name}=...`);
    }
  }

  return normalized;
}

export function logInfo(message) {
  process.stdout.write(`ℹ️ [INFO] ${message}\n`);
}

export function logError(message) {
  process.stderr.write(`❌ [ERROR] ${message}\n`);
}

export function ensureProjectDir(projectDir, dryRun) {
  if (!projectDir) {
    fail("Missing --project-dir <path>.");
  }

  if (dryRun) return;

  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    fail(`Project directory does not exist: ${projectDir}`);
  }
}

export function readTemplate(packRoot, templatePath) {
  return fs.readFileSync(path.resolve(packRoot, templatePath), "utf8");
}

// Records every file written in the current process so `expand` can snapshot
// a baseline after rendering. Reset per expansion via resetWrittenFiles().
const _writtenFiles = [];

export function writeFile(targetFile, content, dryRun) {
  if (dryRun) {
    logInfo(`[dry-run] write ${targetFile}`);
    return;
  }

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, content, "utf8");
  _writtenFiles.push({ file: targetFile, content });
}

export function getWrittenFiles() {
  return _writtenFiles.slice();
}

export function resetWrittenFiles() {
  _writtenFiles.length = 0;
}

export function safeResolve(projectDir, relativePath) {
  if (!isSafeRelativePath(relativePath)) {
    fail(`Invalid target path '${relativePath}'.`);
  }

  const absolute = path.resolve(projectDir, relativePath);
  const projectRoot = path.resolve(projectDir);
  if (!absolute.startsWith(projectRoot)) {
    fail(`Target path escapes project directory: '${relativePath}'.`);
  }

  return absolute;
}
