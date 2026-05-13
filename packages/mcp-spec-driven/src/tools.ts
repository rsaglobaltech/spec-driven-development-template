"use strict";

/**
 * Pure module — no MCP transport dependency.
 * Implements the business logic of every MCP tool exposed by the server.
 * Each function takes a plain JS object (the tool arguments) and returns
 * a plain JS object (the result), making them trivially unit-testable.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// ── Helpers ──────────────────────────────────────────────────────────────────────

function ensureProjectDir(projectDir) {
  if (!projectDir || typeof projectDir !== "string") {
    throw new Error("projectDir is required (absolute path to a spec-driven project)");
  }
  if (!fs.existsSync(projectDir)) {
    throw new Error(`projectDir does not exist: ${projectDir}`);
  }
  const specFile = path.join(projectDir, "spec.md");
  if (!fs.existsSync(specFile)) {
    throw new Error(`Not a spec-driven project (no spec.md): ${projectDir}`);
  }
  return projectDir;
}

// ── Tool: read_spec ────────────────────────────────────────────────────────────────

/**
 * Returns the full content of spec.md and any other top-level spec markdown.
 * @param {{ projectDir: string }} args
 * @returns {{ specMd: string, files: string[] }}
 */
function readSpec(args) {
  const dir = ensureProjectDir(args.projectDir);
  const specMd = fs.readFileSync(path.join(dir, "spec.md"), "utf8");

  const docsSpecsDir = path.join(dir, "docs", "specs");
  const files = [];
  if (fs.existsSync(docsSpecsDir)) {
    for (const entry of fs.readdirSync(docsSpecsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(path.join("docs/specs", entry.name));
      }
    }
  }

  return { specMd, files: files.sort() };
}

// ── Tool: list_requirements ──────────────────────────────────────────────────────────

const REQ_LINE = /\bREQ-(\d{3,})\b/g;
const REQ_HEADING = /^(##+)\s*(REQ-\d{3,})\b\s*[:\-—]?\s*(.*)$/m;

/**
 * Scan spec.md and the traceability matrix and return every requirement found
 * with its title, line, and source file.
 * @param {{ projectDir: string }} args
 * @returns {{ requirements: { id, title, file, line }[] }}
 */
function listRequirements(args) {
  const dir = ensureProjectDir(args.projectDir);
  const sources = [
    { file: "spec.md", path: path.join(dir, "spec.md") },
    { file: "docs/specs/traceability.md", path: path.join(dir, "docs/specs/traceability.md") },
  ];

  const requirements = new Map();
  for (const source of sources) {
    if (!fs.existsSync(source.path)) continue;
    const lines = fs.readFileSync(source.path, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      REQ_LINE.lastIndex = 0;
      let match;
      while ((match = REQ_LINE.exec(line)) !== null) {
        const id = `REQ-${match[1]}`;
        if (!requirements.has(id)) {
          // Try to extract a title from the same line
          let title = "";
          const headingMatch = line.match(REQ_HEADING);
          if (headingMatch && headingMatch[2] === id) {
            title = (headingMatch[3] || "").trim();
          } else {
            // Fall back to remainder of the line after the ID
            const idx = line.indexOf(id);
            title = line
              .slice(idx + id.length)
              .replace(/^[\s:\-—|]+/, "")
              .replace(/\|.*$/, "")
              .trim();
          }
          requirements.set(id, { id, title, file: source.file, line: i });
        }
      }
    }
  }

  return {
    requirements: Array.from(requirements.values()).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

// ── Tool: update_traceability ─────────────────────────────────────────────────────────

/**
 * Append a single row to the traceability matrix. Idempotent: if a row already
 * mentions the requirement and feature file, no change is made.
 * @param {{ projectDir, requirement, scenario, feature, status }} args
 * @returns {{ updated: boolean, rowsAdded: number }}
 */
function updateTraceability(args) {
  const dir = ensureProjectDir(args.projectDir);
  const tracePath = path.join(dir, "docs/specs/traceability.md");
  if (!fs.existsSync(tracePath)) {
    throw new Error("docs/specs/traceability.md not found in this project");
  }

  const required = ["requirement", "feature", "status"];
  for (const k of required) {
    if (!args[k]) throw new Error(`Missing argument: ${k}`);
  }

  const content = fs.readFileSync(tracePath, "utf8");
  const tag = `${args.requirement}.*${args.feature}`;
  if (new RegExp(tag).test(content)) {
    return { updated: false, rowsAdded: 0 };
  }

  const isRich = content.includes(
    "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |"
  );
  const row = isRich
    ? `| ${args.requirement} | ${args.scenario || "TBD"} | \`${args.feature}\` | TBD | TBD | TBD | TBD | TBD | TBD | ${args.status} |`
    : `| \`${args.feature}\` | ${args.requirement} | ${args.scenario || "TBD"} | ${args.status} |`;

  fs.appendFileSync(tracePath, `\n${row}\n`, "utf8");
  return { updated: true, rowsAdded: 1 };
}

// ── Tool: lint_pack ────────────────────────────────────────────────────────────────

/**
 * Run `create-spec-driven-app pack lint` against a pack and return parsed output.
 * @param {{ packRoot: string, packId: string, cliPath?: string }} args
 * @returns {{ exitCode, errors, warnings, raw }}
 */
function lintPack(args) {
  if (!args.packRoot || !args.packId) {
    throw new Error("packRoot and packId are required");
  }
  const cliCmd = (args.cliPath || "npx create-spec-driven-app").trim().split(/\s+/);
  const result = spawnSync(
    cliCmd[0],
    [...cliCmd.slice(1), "pack", "lint", "--pack-root", args.packRoot, "--pack", args.packId],
    { encoding: "utf8", timeout: 30_000, shell: process.platform === "win32" }
  );

  const combined = (result.stdout || "") + "\n" + (result.stderr || "");
  const errors = [];
  const warnings = [];
  for (const line of combined.split("\n")) {
    if (line.includes("[ERROR]")) errors.push(line.replace(/^.*\[ERROR\]\s*/, "").trim());
    else if (line.includes("[WARN]")) warnings.push(line.replace(/^.*\[WARN\]\s*/, "").trim());
  }

  return {
    exitCode: typeof result.status === "number" ? result.status : 1,
    errors,
    warnings,
    raw: combined.trim(),
  };
}

// ── Tool: validate_project ─────────────────────────────────────────────────────────

/**
 * Run `create-spec-driven-app validate <projectDir>` and return parsed output.
 * @param {{ projectDir: string, cliPath?: string }} args
 * @returns {{ exitCode, passed, errors, warnings, raw }}
 */
function validateProject(args) {
  const dir = ensureProjectDir(args.projectDir);
  const cliCmd = (args.cliPath || "npx create-spec-driven-app").trim().split(/\s+/);
  const result = spawnSync(cliCmd[0], [...cliCmd.slice(1), "validate", dir], {
    encoding: "utf8",
    timeout: 30_000,
    shell: process.platform === "win32",
  });

  const combined = (result.stdout || "") + "\n" + (result.stderr || "");
  const errors = [];
  const warnings = [];
  for (const line of combined.split("\n")) {
    if (line.includes("[ERROR]")) errors.push(line.replace(/^.*\[ERROR\]\s*/, "").trim());
    else if (line.includes("[WARN]")) warnings.push(line.replace(/^.*\[WARN\]\s*/, "").trim());
  }

  return {
    exitCode: typeof result.status === "number" ? result.status : 1,
    passed: result.status === 0,
    errors,
    warnings,
    raw: combined.trim(),
  };
}

// ── Tool registry ────────────────────────────────────────────────────────────────

const TOOLS = {
  read_spec: {
    description: "Read the spec.md file (and list other spec markdown) of a spec-driven project.",
    handler: readSpec,
    inputSchema: {
      type: "object",
      properties: {
        projectDir: {
          type: "string",
          description: "Absolute path to the spec-driven project root.",
        },
      },
      required: ["projectDir"],
    },
  },
  list_requirements: {
    description: "List every REQ-NNN in the project with its title, source file, and line number.",
    handler: listRequirements,
    inputSchema: {
      type: "object",
      properties: {
        projectDir: {
          type: "string",
          description: "Absolute path to the spec-driven project root.",
        },
      },
      required: ["projectDir"],
    },
  },
  update_traceability: {
    description: "Append a row to the traceability matrix. Idempotent.",
    handler: updateTraceability,
    inputSchema: {
      type: "object",
      properties: {
        projectDir: { type: "string" },
        requirement: { type: "string", description: "e.g. REQ-001" },
        scenario: { type: "string", description: "e.g. SCN-005 (optional)" },
        feature: {
          type: "string",
          description: "Path to the .feature file (relative to project root)",
        },
        status: { type: "string", enum: ["Draft", "Approved", "Implemented", "Verified"] },
      },
      required: ["projectDir", "requirement", "feature", "status"],
    },
  },
  lint_pack: {
    description: "Run pack lint on a domain pack and return errors/warnings.",
    handler: lintPack,
    inputSchema: {
      type: "object",
      properties: {
        packRoot: { type: "string", description: "Directory containing pack folders." },
        packId: {
          type: "string",
          description: "Pack identifier, e.g. parking-management/backend.",
        },
        cliPath: {
          type: "string",
          description: "Override the CLI command (default: 'npx create-spec-driven-app').",
        },
      },
      required: ["packRoot", "packId"],
    },
  },
  validate_project: {
    description: "Run validate on a spec-driven project and return errors/warnings.",
    handler: validateProject,
    inputSchema: {
      type: "object",
      properties: {
        projectDir: { type: "string" },
        cliPath: { type: "string" },
      },
      required: ["projectDir"],
    },
  },
};

module.exports = {
  TOOLS,
  readSpec,
  listRequirements,
  updateTraceability,
  lintPack,
  validateProject,
};
