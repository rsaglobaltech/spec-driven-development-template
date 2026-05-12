#!/usr/bin/env node
"use strict";

/**
 * pack init — interactively scaffold a valid pack.yaml skeleton.
 *
 * Usage:
 *   create-spec-driven-app pack init --out <directory> [--name <name>] [--type backend|frontend] [--dry-run]
 */

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

function logInfo(msg) {
  process.stdout.write(`ℹ️  [INFO] ${msg}\n`);
}
function logError(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  create-spec-driven-app pack init --out <directory> [--name <name>] [--type backend|frontend] [--dry-run]\n\n" +
      "Options:\n" +
      "  --out       Directory to write the new pack (required)\n" +
      "  --name      Human-readable pack name (prompted if omitted)\n" +
      "  --type      Project type: backend | frontend  (default: backend)\n" +
      "  --dry-run   Print the generated pack.yaml without writing to disk\n"
  );
}

function parseArgs(argv) {
  const opts = { out: null, name: null, type: "backend", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) {
      opts.out = argv[++i];
    } else if (a === "--name" && argv[i + 1]) {
      opts.name = argv[++i];
    } else if (a === "--type" && argv[i + 1]) {
      opts.type = argv[++i];
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
  }
  return opts;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildPackYaml(name, type, _slug) {
  return `# yaml-language-server: $schema=../../schemas/pack.schema.json
schema_version: "1.1.0"

metadata:
  name: "${name}"
  version: "0.1.0"
  language: "en"
  project_type: "${type}"

variables:
  required:
    - PROJECT_NAME
    - PROJECT_SLUG
    - DOMAIN

requirements:
  - id: REQ-001
    title: "TODO: describe first requirement"
    priority: Must
    description: "TODO: explain the business need."
    status: Draft

bounded_contexts:
  - id: BC-001
    name: "TODO: Core Context"
    type: Core
    responsibility: "TODO: describe responsibility"
    aggregates:
      - TodoAggregate

use_cases:
  - id: UC-001
    title: "TODO: first use case"
    actor: "User"
    precondition: "System is available"
    steps:
      - "Actor does something"
    postcondition: "System responds"
    requirements:
      - REQ-001

aggregates:
  - id: AGG-001
    name: TodoAggregate
    bounded_context: BC-001
    responsibilities:
      - "TODO: aggregate responsibility"
    commands:
      - CreateTodo
    events:
      - TodoCreated

events:
  - id: EVT-001
    name: TodoCreated
    aggregate: TodoAggregate
    payload:
      - id: string
      - createdAt: datetime

outputs:
  features: []
  diagrams: []

rules:
  - id: RUL-001
    title: "TODO: first business rule"
    context: BC-001
    description: "TODO: define the invariant."

scenarios:
  - id: SCN-001
    title: "TODO: first scenario title"
    requirement: REQ-001
    use_case: UC-001
    given: "TODO: precondition"
    when: "TODO: action"
    then: "TODO: outcome"
`;
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(3); // strip "node <script>" + "pack" sub-verb
  const opts = parseArgs(args);

  if (!opts.out && !opts.dryRun) {
    logError("--out <directory> is required (use --dry-run to preview without writing).");
    usage();
    process.exit(2);
  }

  if (!["backend", "frontend"].includes(opts.type)) {
    logError(`--type must be 'backend' or 'frontend', got: ${opts.type}`);
    process.exit(2);
  }

  let name = opts.name;
  if (!name) {
    if (!process.stdin.isTTY) {
      logError("--name is required when stdin is not a TTY.");
      process.exit(2);
    }
    name = await prompt("Pack name (e.g. 'Parking Management Backend'): ");
    if (!name) {
      logError("Pack name cannot be empty.");
      process.exit(2);
    }
  }

  const slug = slugify(name);
  const yaml = buildPackYaml(name, opts.type, slug);

  if (opts.dryRun) {
    process.stdout.write("--- dry-run: pack.yaml ---\n");
    process.stdout.write(yaml);
    process.exit(0);
  }

  const packDir = path.resolve(opts.out, `${slug}/${opts.type}`);
  const packFile = path.join(packDir, "pack.yaml");

  if (fs.existsSync(packFile)) {
    logError(`pack.yaml already exists at: ${packFile}`);
    process.exit(1);
  }

  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(packFile, yaml, "utf8");
  logInfo(`Created: ${packFile}`);
  logInfo(
    "Edit the file to replace all TODO placeholders, then run: create-spec-driven-app pack lint --pack-root <root> --pack " +
      slug +
      "/" +
      opts.type
  );
  process.exit(0);
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
