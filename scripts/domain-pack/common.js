#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function stripInlineComment(line) {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (ch === "#" && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1])) {
        return line.slice(0, i).trimEnd();
      }
    }
  }

  return line;
}

function splitKeyValue(text) {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (ch === ":" && !inSingle && !inDouble) {
      return {
        key: text.slice(0, i).trim(),
        value: text.slice(i + 1).trim(),
      };
    }
  }

  return null;
}

function parseScalar(raw) {
  const text = raw.trim();

  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }

  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return Number(text);
  }

  return text;
}

function parseTokens(tokens) {
  let index = 0;

  function parseNode(indent) {
    if (index >= tokens.length) return null;
    if (tokens[index].indent < indent) return null;

    if (tokens[index].indent === indent && tokens[index].text.startsWith("- ")) {
      return parseList(indent);
    }

    return parseObject(indent);
  }

  function parseObject(indent) {
    const obj = {};

    while (index < tokens.length) {
      const token = tokens[index];
      if (token.indent !== indent) break;
      if (token.text.startsWith("- ")) break;

      const pair = splitKeyValue(token.text);
      if (!pair || !pair.key) {
        throw new Error(`Invalid YAML object entry on line ${token.line}: ${token.text}`);
      }

      index += 1;

      if (pair.value === "") {
        if (index < tokens.length && tokens[index].indent > indent) {
          obj[pair.key] = parseNode(tokens[index].indent);
        } else {
          obj[pair.key] = {};
        }
      } else {
        obj[pair.key] = parseScalar(pair.value);
      }
    }

    return obj;
  }

  function parseList(indent) {
    const arr = [];

    while (index < tokens.length) {
      const token = tokens[index];
      if (token.indent !== indent || !token.text.startsWith("- ")) break;

      const itemText = token.text.slice(2).trim();
      index += 1;

      if (itemText === "") {
        if (index < tokens.length && tokens[index].indent > indent) {
          arr.push(parseNode(tokens[index].indent));
        } else {
          arr.push(null);
        }
        continue;
      }

      const inlinePair = splitKeyValue(itemText);
      if (!inlinePair) {
        arr.push(parseScalar(itemText));
        continue;
      }

      const obj = {};
      if (inlinePair.value === "") {
        if (index < tokens.length && tokens[index].indent > indent) {
          obj[inlinePair.key] = parseNode(tokens[index].indent);
        } else {
          obj[inlinePair.key] = {};
        }
      } else {
        obj[inlinePair.key] = parseScalar(inlinePair.value);
      }

      if (
        index < tokens.length &&
        tokens[index].indent > indent &&
        !tokens[index].text.startsWith("- ")
      ) {
        const childIndent = tokens[index].indent;
        const extra = parseObject(childIndent);
        Object.assign(obj, extra);
      }

      arr.push(obj);
    }

    return arr;
  }

  const firstIndent = tokens.length > 0 ? tokens[0].indent : 0;
  const root = parseNode(firstIndent) || {};

  if (index < tokens.length) {
    const token = tokens[index];
    throw new Error(`Unexpected YAML token on line ${token.line}: ${token.text}`);
  }

  return root;
}

function parseYamlLite(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const tokens = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const withoutComment = stripInlineComment(line);
    if (!withoutComment.trim()) continue;

    const indent = withoutComment.match(/^\s*/)[0].length;
    tokens.push({
      indent,
      text: withoutComment.trim(),
      line: i + 1,
    });
  }

  if (tokens.length === 0) return {};
  return parseTokens(tokens);
}

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

const ALLOWED_STATUSES = new Set([
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

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function formatList(value, fallback = "-") {
  const items = asArray(value)
    .map((item) => String(item).trim())
    .filter(Boolean);
  return items.length > 0 ? items.join(", ") : fallback;
}

function entityLabel(entity, fallback = "-") {
  if (!entity) return fallback;
  if (typeof entity === "string") return entity;
  if (entity.id && entity.name) return `${entity.id} ${entity.name}`;
  if (entity.id) return entity.id;
  if (entity.name) return entity.name;
  return fallback;
}

function hasStructuredDomainModel(pack) {
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

function parseArgs(argv) {
  const args = {
    packRoot: "",
    pack: "",
    projectDir: "",
    dryRun: false,
    noExamples: false,
    vars: {},
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

function loadPack(packRoot, packId) {
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

function validatePackModel(pack, packRoot) {
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

  if (!["backend", "frontend"].includes(metadata.project_type)) {
    fail(
      `metadata.project_type must be 'backend' or 'frontend'. Found '${metadata.project_type}'.`
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

    const requiredScenarioFields = ["id", "target", "template", "feature", "scenario"];

    for (const field of requiredScenarioFields) {
      if (!scenario[field] || typeof scenario[field] !== "string") {
        fail(`Scenario is missing required field '${field}'.`);
      }
    }

    if (scenarioIds.has(scenario.id)) {
      fail(`Duplicate scenario id detected: '${scenario.id}'.`);
    }
    scenarioIds.add(scenario.id);

    if (!scenario.technical_artifact && !Array.isArray(scenario.technical_artifacts)) {
      fail(`Scenario '${scenario.id}' requires technical_artifact or technical_artifacts.`);
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

function renderTemplate(content, vars) {
  return content.replace(/{{([A-Z][A-Z0-9_]*)}}/g, (_, token) => {
    if (!(token in vars)) {
      fail(`Missing variable '${token}' required by template.`);
    }
    return String(vars[token]);
  });
}

function normalizeVars(requiredVars, providedVars) {
  const normalized = { ...providedVars };

  for (const name of requiredVars) {
    if (!(name in normalized) || normalized[name] === "") {
      fail(`Missing required variable '${name}'. Provide it using --var ${name}=...`);
    }
  }

  return normalized;
}

function logInfo(message) {
  process.stdout.write(`ℹ️ [INFO] ${message}\n`);
}

function logError(message) {
  process.stderr.write(`❌ [ERROR] ${message}\n`);
}

function ensureProjectDir(projectDir, dryRun) {
  if (!projectDir) {
    fail("Missing --project-dir <path>.");
  }

  if (dryRun) return;

  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    fail(`Project directory does not exist: ${projectDir}`);
  }
}

function readTemplate(packRoot, templatePath) {
  return fs.readFileSync(path.resolve(packRoot, templatePath), "utf8");
}

function writeFile(targetFile, content, dryRun) {
  if (dryRun) {
    logInfo(`[dry-run] write ${targetFile}`);
    return;
  }

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, content, "utf8");
}

function safeResolve(projectDir, relativePath) {
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

function parseTraceabilityRows(existingContent) {
  const rows = [];
  const seen = new Set();
  let mode = "legacy";

  const lines = existingContent.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || trimmed.includes("---")) continue;

    const cells = trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

    if (cells[0] === "Requirement" && cells[1] === "Scenario ID") {
      mode = "rich";
      continue;
    }

    if (cells[0] === "Feature" && cells[1] === "Scenario") {
      continue;
    }

    if (cells.length === 10) {
      mode = "rich";
      const row = {
        requirement: cells[0],
        scenarioId: cells[1],
        featureFile: cells[2],
        useCase: cells[3],
        commandOrQuery: cells[4],
        aggregate: cells[5],
        event: cells[6],
        technicalArtifact: cells[7],
        testArtifact: cells[8],
        status: cells[9],
      };
      const key = `${row.featureFile}::${row.scenarioId}`;
      if (seen.has(key)) continue;

      seen.add(key);
      rows.push(row);
      continue;
    }

    if (cells.length !== 4) continue;

    const row = {
      feature: cells[0],
      scenario: cells[1],
      technicalArtifact: cells[2],
      status: cells[3],
    };
    const key = `${row.feature}::${row.scenario}`;
    if (seen.has(key)) continue;

    seen.add(key);
    rows.push(row);
  }

  return { mode, rows };
}

function buildTraceabilityMarkdown(rows, mode = "legacy") {
  if (mode === "rich") {
    const header = [
      "# Traceability Matrix",
      "",
      "Map requirements to scenarios, domain model elements, implementation artifacts, and tests.",
      "",
      "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |",
      "|---|---|---|---|---|---|---|---|---|---|",
    ];

    const body = rows
      .map((row) => [
        row.requirement || "-",
        row.scenarioId || "-",
        row.featureFile || "-",
        row.useCase || "-",
        row.commandOrQuery || "-",
        row.aggregate || "-",
        row.event || "-",
        row.technicalArtifact || "-",
        row.testArtifact || "-",
        row.status || "Draft",
      ])
      .map((cells) => `| ${cells.join(" | ")} |`);

    return `${header.concat(body).join("\n")}\n`;
  }

  const header = [
    "# Traceability Matrix",
    "",
    "Map business specifications to scenarios and technical artifacts.",
    "",
    "| Feature | Scenario | Technical artifact | Status |",
    "|---|---|---|---|",
  ];

  const body = rows.map(
    (row) => `| ${row.feature} | ${row.scenario} | ${row.technicalArtifact} | ${row.status} |`
  );
  return `${header.concat(body).join("\n")}\n`;
}

module.exports = {
  ALLOWED_STATUSES,
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
};
