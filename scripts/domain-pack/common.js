#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

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

    if (ch === '#' && !inSingle && !inDouble) {
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

    if (ch === ':' && !inSingle && !inDouble) {
      return {
        key: text.slice(0, i).trim(),
        value: text.slice(i + 1).trim()
      };
    }
  }

  return null;
}

function parseScalar(raw) {
  const text = raw.trim();

  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }

  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;

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

    if (tokens[index].indent === indent && tokens[index].text.startsWith('- ')) {
      return parseList(indent);
    }

    return parseObject(indent);
  }

  function parseObject(indent) {
    const obj = {};

    while (index < tokens.length) {
      const token = tokens[index];
      if (token.indent !== indent) break;
      if (token.text.startsWith('- ')) break;

      const pair = splitKeyValue(token.text);
      if (!pair || !pair.key) {
        throw new Error(`Invalid YAML object entry on line ${token.line}: ${token.text}`);
      }

      index += 1;

      if (pair.value === '') {
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
      if (token.indent !== indent || !token.text.startsWith('- ')) break;

      const itemText = token.text.slice(2).trim();
      index += 1;

      if (itemText === '') {
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
      if (inlinePair.value === '') {
        if (index < tokens.length && tokens[index].indent > indent) {
          obj[inlinePair.key] = parseNode(tokens[index].indent);
        } else {
          obj[inlinePair.key] = {};
        }
      } else {
        obj[inlinePair.key] = parseScalar(inlinePair.value);
      }

      if (index < tokens.length && tokens[index].indent > indent && !tokens[index].text.startsWith('- ')) {
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
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const tokens = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const withoutComment = stripInlineComment(line);
    if (!withoutComment.trim()) continue;

    const indent = withoutComment.match(/^\s*/)[0].length;
    tokens.push({
      indent,
      text: withoutComment.trim(),
      line: i + 1
    });
  }

  if (tokens.length === 0) return {};
  return parseTokens(tokens);
}

function toPosixPath(inputPath) {
  return inputPath.replace(/\\/g, '/');
}

function isSafeRelativePath(candidate) {
  if (!candidate || typeof candidate !== 'string') return false;
  if (path.isAbsolute(candidate)) return false;

  const normalized = toPosixPath(path.posix.normalize(candidate));
  if (normalized.startsWith('../') || normalized === '..') return false;
  if (normalized.includes('/../')) return false;
  return true;
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {
    packRoot: '',
    pack: '',
    projectDir: '',
    dryRun: false,
    noExamples: false,
    vars: {}
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--pack-root') {
      args.packRoot = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (token === '--pack') {
      args.pack = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (token === '--project-dir') {
      args.projectDir = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--no-examples') {
      args.noExamples = true;
      continue;
    }

    if (token === '--var') {
      const pair = argv[i + 1] || '';
      i += 1;
      const eq = pair.indexOf('=');
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
  if (!packRoot) fail('Missing --pack-root <path>.');
  if (!packId) fail('Missing --pack <domain/type>.');

  const normalizedRoot = path.resolve(packRoot);
  const normalizedPackPath = path.resolve(normalizedRoot, packId);
  const packFile = path.join(normalizedPackPath, 'pack.yaml');

  if (!normalizedPackPath.startsWith(normalizedRoot)) {
    fail(`Invalid pack path '${packId}'.`);
  }

  if (!fs.existsSync(packFile)) {
    fail(`Pack file not found: ${packFile}`);
  }

  const pack = parseYamlLite(fs.readFileSync(packFile, 'utf8'));

  return {
    pack,
    packFile,
    packRoot: normalizedPackPath
  };
}

function validatePackModel(pack, packRoot) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    fail('Invalid pack format. Root must be an object.');
  }

  const metadata = pack.metadata || {};
  const requiredMetadata = ['name', 'version', 'language', 'project_type'];
  for (const key of requiredMetadata) {
    if (!metadata[key] || typeof metadata[key] !== 'string') {
      fail(`metadata.${key} is required and must be a string.`);
    }
  }

  if (!['backend', 'frontend'].includes(metadata.project_type)) {
    fail(`metadata.project_type must be 'backend' or 'frontend'. Found '${metadata.project_type}'.`);
  }

  const requiredVars = pack.variables && Array.isArray(pack.variables.required)
    ? pack.variables.required
    : [];

  if (requiredVars.length === 0) {
    fail('variables.required must contain at least one variable.');
  }

  for (const varName of requiredVars) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(varName)) {
      fail(`Invalid variable name in variables.required: '${varName}'.`);
    }
  }

  const outputs = pack.outputs || {};
  if (!Array.isArray(outputs.files) || outputs.files.length === 0) {
    fail('outputs.files must contain at least one file definition.');
  }

  const targets = new Set();

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
    if (!fileDef || typeof fileDef !== 'object') {
      fail('outputs.files entries must be objects.');
    }

    if (!fileDef.target || !fileDef.template) {
      fail('Each outputs.files entry requires target and template.');
    }

    assertTarget(fileDef.target, 'outputs.files');
    assertTemplateExists(fileDef.template, `outputs.files target '${fileDef.target}'`);
  }

  if (!pack.rules || !pack.rules.traceability || !pack.rules.traceability.target) {
    fail('rules.traceability.target is required.');
  }

  if (!isSafeRelativePath(pack.rules.traceability.target)) {
    fail('rules.traceability.target must be a safe relative path.');
  }

  const scenarios = Array.isArray(pack.scenarios) ? pack.scenarios : [];
  for (const scenario of scenarios) {
    if (!scenario || typeof scenario !== 'object') {
      fail('scenarios entries must be objects.');
    }

    const requiredScenarioFields = [
      'id',
      'target',
      'template',
      'feature',
      'scenario',
      'technical_artifact'
    ];

    for (const field of requiredScenarioFields) {
      if (!scenario[field] || typeof scenario[field] !== 'string') {
        fail(`Scenario is missing required field '${field}'.`);
      }
    }

    if (scenario.seed !== undefined && typeof scenario.seed !== 'boolean') {
      fail(`Scenario '${scenario.id}' has invalid 'seed' value. Expected boolean.`);
    }

    if (scenario.status !== undefined && typeof scenario.status !== 'string') {
      fail(`Scenario '${scenario.id}' has invalid 'status' value. Expected string.`);
    }

    assertTarget(scenario.target, `scenario '${scenario.id}'`);
    assertTemplateExists(scenario.template, `scenario '${scenario.id}'`);
  }

  return {
    requiredVars
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
    if (!(name in normalized) || normalized[name] === '') {
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
    fail('Missing --project-dir <path>.');
  }

  if (dryRun) return;

  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    fail(`Project directory does not exist: ${projectDir}`);
  }
}

function readTemplate(packRoot, templatePath) {
  return fs.readFileSync(path.resolve(packRoot, templatePath), 'utf8');
}

function writeFile(targetFile, content, dryRun) {
  if (dryRun) {
    logInfo(`[dry-run] write ${targetFile}`);
    return;
  }

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, content, 'utf8');
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

  const lines = existingContent.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.includes('---')) continue;

    const cells = trimmed
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

    if (cells.length !== 4) continue;
    if (cells[0] === 'Feature' && cells[1] === 'Scenario') continue;

    const key = `${cells[0]}::${cells[1]}`;
    if (seen.has(key)) continue;

    seen.add(key);
    rows.push(cells);
  }

  return rows;
}

function buildTraceabilityMarkdown(rows) {
  const header = [
    '# 🔗 Traceability Matrix',
    '',
    'Map business specifications to scenarios and technical artifacts.',
    '',
    '| Feature | Scenario | Technical artifact | Status |',
    '|---|---|---|---|'
  ];

  const body = rows.map((cells) => `| ${cells[0]} | ${cells[1]} | ${cells[2]} | ${cells[3]} |`);
  return `${header.concat(body).join('\n')}\n`;
}

module.exports = {
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
};
