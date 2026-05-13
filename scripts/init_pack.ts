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

const COLOR_ENABLED =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR_ENABLED ? "\x1b[0m" : "",
  bold: COLOR_ENABLED ? "\x1b[1m" : "",
  dim: COLOR_ENABLED ? "\x1b[2m" : "",
  cyan: COLOR_ENABLED ? "\x1b[36m" : "",
  green: COLOR_ENABLED ? "\x1b[32m" : "",
  red: COLOR_ENABLED ? "\x1b[31m" : "",
  yellow: COLOR_ENABLED ? "\x1b[33m" : "",
};

function logError(msg) {
  process.stderr.write(`${c.red}✖${c.reset}  ${msg}\n`);
}
function logSuccess(msg) {
  process.stdout.write(`${c.green}✔${c.reset}  ${msg}\n`);
}

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}📦 pack init${c.reset}  ${c.dim}— scaffold a domain-pack skeleton${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    ${c.cyan}create-spec-driven-app pack init${c.reset} --out <dir> [--name <name>] [--type <kind>] [--dry-run]\n\n` +
      `  ${c.bold}OPTIONS${c.reset}\n` +
      `    ${c.green}--out <dir>${c.reset}     ${c.dim}Directory to write the new pack (required).${c.reset}\n` +
      `    ${c.green}--name <name>${c.reset}   ${c.dim}Human-readable pack name (prompted if omitted).${c.reset}\n` +
      `    ${c.green}--type <kind>${c.reset}   ${c.dim}Pack flavour: backend · frontend · contracts.  (default: backend)${c.reset}\n` +
      `    ${c.green}--dry-run${c.reset}       ${c.dim}Print the generated pack.yaml; touch nothing.${c.reset}\n` +
      `    ${c.green}-h, --help${c.reset}      ${c.dim}Show this help.${c.reset}\n\n` +
      `  ${c.bold}EXAMPLES${c.reset}\n` +
      `    ${c.yellow}$${c.reset} create-spec-driven-app pack init --out ./domain-packs --name "Billing Backend"\n` +
      `    ${c.yellow}$${c.reset} create-spec-driven-app pack init --out ./domain-packs --name "Order API" --type contracts\n` +
      `    ${c.yellow}$${c.reset} create-spec-driven-app pack init --out ./domain-packs --name "Checkout UI" --type frontend --dry-run\n\n`
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
  if (type === "contracts") return buildContractsPackYaml(name);
  return buildBackendOrFrontendPackYaml(name, type);
}

function buildBackendOrFrontendPackYaml(name, type) {
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

function buildContractsPackYaml(name) {
  return `# yaml-language-server: $schema=../../schemas/pack.schema.json
schema_version: "1.2.0"

metadata:
  name: "${name}"
  version: "0.1.0"
  language: "en"
  project_type: "contracts"

variables:
  required:
    - PROJECT_NAME
    - PROJECT_SLUG
    - PROVIDER_SERVICE
    - CONSUMER_SERVICE

requirements:
  - id: REQ-001
    title: "TODO: define REST API contract between provider and consumer"
    priority: Must
    description: "TODO: explain the contract intent (OpenAPI / AsyncAPI)."
    status: Draft
  - id: REQ-002
    title: "TODO: consumer-driven Pact tests for every endpoint"
    priority: Must
    description: "Each consumer expresses expected interactions; provider verifies on CI."
    status: Draft

api_contracts:
  - id: AC-001
    title: "TODO: Provider REST API — v1"
    type: REST                       # REST | GraphQL | AsyncAPI | gRPC
    provider: "{{PROVIDER_SERVICE}}"
    consumers:
      - "{{CONSUMER_SERVICE}}"
    schema_ref: "contracts/openapi/provider-v1.yaml"
    requirement: REQ-001

consumer_driven_tests:
  - id: CDT-001
    consumer: "{{CONSUMER_SERVICE}}"
    provider: "{{PROVIDER_SERVICE}}"
    pact_file: "contracts/pacts/{{CONSUMER_SERVICE}}-{{PROVIDER_SERVICE}}.json"
    requirement: REQ-002

breaking_change_rules:
  - contract_id: AC-001
    rules:
      - "Removing a required request field is a breaking change"
      - "Changing an existing response field type is a breaking change"
      - "Removing an endpoint path is a breaking change"

outputs:
  files:
    - target: "contracts/openapi/provider-v1.yaml"
    - target: "docs/specs/test-strategy.md"
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

  if (!["backend", "frontend", "contracts"].includes(opts.type)) {
    logError(`--type must be 'backend', 'frontend', or 'contracts', got: ${opts.type}`);
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
  logSuccess(`Created ${c.bold}${packFile}${c.reset}`);
  process.stdout.write(
    `\n  ${c.bold}Next steps${c.reset}\n` +
      `    1. Replace every ${c.yellow}TODO${c.reset} in the file.\n` +
      `    2. Lint the pack:\n` +
      `         ${c.yellow}$${c.reset} create-spec-driven-app pack lint --pack-root ${path.resolve(opts.out)} --pack ${slug}/${opts.type}\n` +
      `    3. Apply it to a project:\n` +
      `         ${c.yellow}$${c.reset} create-spec-driven-app expand --pack-root ${path.resolve(opts.out)} --pack ${slug}/${opts.type} \\\n           --project-dir <your-project> --var PROJECT_NAME="…" --var PROJECT_SLUG=…\n\n`
  );
  process.exit(0);
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
