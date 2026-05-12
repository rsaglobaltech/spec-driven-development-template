"use strict";

/**
 * Pure module — no vscode dependency.
 * Validates pack.yaml content against the JSON Schema (draft 2020-12).
 * Returns structured diagnostic objects that extension.js converts to
 * vscode.Diagnostic instances.
 */

const yaml = require("js-yaml");
const path = require("node:path");
const fs = require("node:fs");

// Resolve the bundled schema relative to this file.
// In the monorepo the schema lives two directories up; in a packaged .vsix it
// will be copied alongside the extension root (see .vscodeignore).
const DEFAULT_SCHEMA_PATH = path.resolve(__dirname, "../../../schemas/pack.schema.json");

function loadAjv() {
  // ajv/dist/2020 supports JSON Schema draft 2020-12.
  // We lazy-require so callers that only use parseOnly don't pay the cost.
  const Ajv2020 = require("ajv/dist/2020");
  return new Ajv2020({ allErrors: true, strict: false });
}

/**
 * @typedef {{ line: number, col: number, message: string, severity: "error"|"warning" }} Diag
 * @typedef {{ parseError: Diag|null, errors: Diag[] }} ValidationResult
 */

/**
 * Validate YAML content against the pack schema.
 * @param {string} content   Raw YAML text
 * @param {string} [schemaPath]  Optional override path to pack.schema.json
 * @returns {ValidationResult}
 */
function validatePackYaml(content, schemaPath) {
  // 1. Parse YAML
  let parsed;
  try {
    parsed = yaml.load(content, { json: true });
  } catch (err) {
    return {
      parseError: {
        line: err.mark ? err.mark.line : 0,
        col: err.mark ? err.mark.column : 0,
        message: `YAML parse error: ${err.message}`,
        severity: "error",
      },
      errors: [],
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      parseError: {
        line: 0,
        col: 0,
        message: "pack.yaml root must be a YAML mapping (object), not a scalar or sequence.",
        severity: "error",
      },
      errors: [],
    };
  }

  // 2. Load schema
  const resolvedSchema = schemaPath || DEFAULT_SCHEMA_PATH;
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(resolvedSchema, "utf8"));
  } catch (err) {
    return {
      parseError: null,
      errors: [
        {
          line: 0,
          col: 0,
          message: `Cannot load pack schema from '${resolvedSchema}': ${err.message}`,
          severity: "warning",
        },
      ],
    };
  }

  // 3. Validate with AJV
  let ajv;
  try {
    ajv = loadAjv();
  } catch (err) {
    return {
      parseError: null,
      errors: [
        {
          line: 0,
          col: 0,
          message: `AJV not available: ${err.message}. Install ajv@^8 to enable schema validation.`,
          severity: "warning",
        },
      ],
    };
  }

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (err) {
    return {
      parseError: null,
      errors: [
        {
          line: 0,
          col: 0,
          message: `Schema compile error: ${err.message}`,
          severity: "warning",
        },
      ],
    };
  }

  const valid = validate(parsed);
  if (valid) return { parseError: null, errors: [] };

  // 4. Map AJV errors to approximate line numbers
  const lines = content.split("\n");
  const errors = (validate.errors || []).map((err) => {
    const line = findApproximateLine(lines, err.instancePath, err.schemaPath);
    return {
      line,
      col: 0,
      message: formatAjvError(err),
      severity: "error",
    };
  });

  return { parseError: null, errors };
}

function formatAjvError(err) {
  const ptr = err.instancePath || "(root)";
  const schema = err.parentSchema && err.parentSchema.description
    ? ` (${err.parentSchema.description})`
    : "";
  return `${ptr}: ${err.message}${schema}`;
}

/**
 * Best-effort: scan the YAML lines for a key matching the last segment of the
 * JSON Pointer. Falls back to line 0.
 */
function findApproximateLine(lines, instancePath, schemaPath) {
  const parts = (instancePath || "").split("/").filter(Boolean);
  if (parts.length === 0) return 0;

  // Try progressively shorter paths until a match is found
  for (let depth = parts.length; depth > 0; depth--) {
    const key = parts[depth - 1];
    // Skip numeric indices — look for their parent key
    if (/^\d+$/.test(key)) continue;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();
      if (
        trimmed.startsWith(key + ":") ||
        trimmed.startsWith('"' + key + '":') ||
        trimmed.startsWith("'" + key + "':")
      ) {
        return i;
      }
    }
  }
  return 0;
}

module.exports = { validatePackYaml, findApproximateLine };
