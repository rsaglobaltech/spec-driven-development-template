#!/usr/bin/env node
"use strict";

// csda:allow-placeholders — this file emits or asserts on {{VAR}} template syntax.
/**
 * pack init — interactively scaffold a valid pack.yaml skeleton.
 *
 * Usage:
 *   csda pack init --out <directory> [--name <name>] [--type backend|frontend] [--dry-run]
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
      `    ${c.cyan}csda pack init${c.reset} --out <dir> [--name <name>] [--type <kind>] [--dry-run]\n\n` +
      `  ${c.bold}OPTIONS${c.reset}\n` +
      `    ${c.green}--out <dir>${c.reset}     ${c.dim}Directory to write the new pack (required).${c.reset}\n` +
      `    ${c.green}--name <name>${c.reset}   ${c.dim}Human-readable pack name (prompted if omitted).${c.reset}\n` +
      `    ${c.green}--type <kind>${c.reset}   ${c.dim}Pack flavour: backend · frontend · contracts.  (default: backend)${c.reset}\n` +
      `    ${c.green}--dry-run${c.reset}       ${c.dim}Print the generated pack.yaml; touch nothing.${c.reset}\n` +
      `    ${c.green}-h, --help${c.reset}      ${c.dim}Show this help.${c.reset}\n\n` +
      `  ${c.bold}EXAMPLES${c.reset}\n` +
      `    ${c.yellow}$${c.reset} csda pack init --out ./domain-packs --name "Billing Backend"\n` +
      `    ${c.yellow}$${c.reset} csda pack init --out ./domain-packs --name "Order API" --type contracts\n` +
      `    ${c.yellow}$${c.reset} csda pack init --out ./domain-packs --name "Checkout UI" --type frontend --dry-run\n\n`
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
  files:
    - target: "AI_RULES.md"
      template: "templates/AI_RULES.md.tpl"
    - target: "spec.md"
      template: "templates/spec.md.tpl"

rules:
  traceability:
    target: "docs/specs/traceability.md"
    include_existing_rows: true
    default_status: Draft

scenarios:
  - id: "SCN-001"
    requirement_id: REQ-001
    use_case: UC-001
    seed: true
    target: "features/core/example.feature"
    template: "templates/features/example.feature.tpl"
    feature: "TODO: feature name"
    scenario: "TODO: first scenario title"
    technical_artifacts:
      - "TODO: the component this scenario exercises"
    test_artifact: "TODO: the test that proves it"
    status: "Draft"
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
      template: "templates/provider-v1.yaml.tpl"
    - target: "docs/specs/test-strategy.md"
      template: "templates/test-strategy.md.tpl"

rules:
  traceability:
    target: "docs/specs/traceability.md"
    include_existing_rows: true
    default_status: Draft
`;
}

/**
 * The template files a generated `pack.yaml` declares in `outputs.files`.
 *
 * `pack init` used to write pack.yaml alone, so the pack it produced could not
 * be expanded: `outputs.files` named templates that did not exist, and
 * validation rejects a missing template. A scaffolder whose output does not
 * survive its own next step is not a scaffolder.
 *
 * Deliberately thin. They exist so `expand` succeeds on a fresh pack; the
 * author replaces them.
 */
function templatesFor(type) {
  if (type === "contracts") {
    return {
      "templates/provider-v1.yaml.tpl":
        "openapi: 3.1.0\ninfo:\n  title: {{PROJECT_NAME}} provider API\n  version: 1.0.0\npaths: {}\n",
      "templates/test-strategy.md.tpl":
        "# Test strategy — {{PROJECT_NAME}}\n\nTODO: describe the consumer-driven contract tests this pack expects.\n",
    };
  }
  return {
    "templates/features/example.feature.tpl":
      "Feature: TODO: feature name\n" +
      "  Scenario: TODO: first scenario title\n" +
      "    GIVEN a precondition\n" +
      "    WHEN something happens\n" +
      "    THEN an outcome is observable\n",
    "templates/AI_RULES.md.tpl":
      "# AI_RULES — {{PROJECT_NAME}}\n\nTODO: the execution contract for agents working in the {{DOMAIN}} domain.\n",
    "templates/spec.md.tpl": "# {{PROJECT_NAME}}\n\nTODO: the business manifesto for {{DOMAIN}}.\n",
  };
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

  // Without these the pack declares templates that do not exist, and both
  // `pack lint` and `expand` reject it.
  for (const [rel, body] of Object.entries(templatesFor(opts.type))) {
    const abs = path.join(packDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, "utf8");
    logSuccess(`Created ${c.bold}${abs}${c.reset}`);
  }
  process.stdout.write(
    `\n  ${c.bold}Next steps${c.reset}\n` +
      `    1. Replace every ${c.yellow}TODO${c.reset} in the file.\n` +
      `    2. Lint the pack:\n` +
      `         ${c.yellow}$${c.reset} csda pack lint --pack-root ${path.resolve(opts.out)} --pack ${slug}/${opts.type}\n` +
      `    3. Apply it to a project:\n` +
      `         ${c.yellow}$${c.reset} csda expand --pack-root ${path.resolve(opts.out)} --pack ${slug}/${opts.type} \\\n           --project-dir <your-project> --var PROJECT_NAME="…" --var PROJECT_SLUG=…\n\n`
  );
  process.exit(0);
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
