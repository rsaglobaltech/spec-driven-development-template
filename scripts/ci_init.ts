#!/usr/bin/env node
"use strict";

/**
 * `ci init` — generate the Spec-Driven Development CI gate for the CI
 * provider your organisation actually uses (enterprise rarely means GitHub).
 *
 * Usage:
 *   create-spec-driven-app ci init --provider github|gitlab|azure|jenkins
 *                                   [--project-dir <dir>] [--stdout] [--force]
 *
 * The generated job runs `validate --strict-tdd` and publishes the
 * machine-readable `plan --format json` as a build artifact.
 */

const fs = require("node:fs");
const path = require("node:path");
const { renderTemplate } = require("./domain-pack/common");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const CI_TEMPLATES = path.join(ROOT_DIR, "templates", "ci");
const packageJson = require(path.join(ROOT_DIR, "package.json"));

/** Provider registry: template file + canonical destination in a repo. */
const PROVIDERS = {
  github: { template: "github.yml.tpl", dest: ".github/workflows/spec-gate.yml" },
  gitlab: { template: "gitlab.yml.tpl", dest: ".gitlab-ci.yml" },
  azure: { template: "azure.yml.tpl", dest: "azure-pipelines.yml" },
  jenkins: { template: "jenkins.tpl", dest: "Jenkinsfile" },
};

function logInfo(msg) {
  process.stdout.write(`ℹ️ [INFO] ${msg}\n`);
}
function logError(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}
function logFix(msg) {
  process.stderr.write(`💡 [FIX] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    "Usage:\n" +
      "  create-spec-driven-app ci init --provider <provider> [options]\n\n" +
      `Providers: ${Object.keys(PROVIDERS).join(" | ")}\n\n` +
      "Options:\n" +
      "  --provider <name>    CI provider (required)\n" +
      "  --project-dir <dir>  Repository root (default: current directory)\n" +
      "  --stdout             Print the config instead of writing it\n" +
      "  --force              Overwrite the destination file if it exists\n"
  );
}

function parseArgs(argv) {
  const opts = { provider: null, projectDir: process.cwd(), stdout: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider" && argv[i + 1]) opts.provider = argv[++i];
    else if (a === "--project-dir" && argv[i + 1]) opts.projectDir = path.resolve(argv[++i]);
    else if (a === "--stdout") opts.stdout = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else {
      logError(`Unknown argument: ${a}`);
      usage();
      process.exit(2);
    }
  }
  return opts;
}

function main() {
  let rawArgs = process.argv.slice(2);
  // Called via dispatcher as `ci init ...` or directly.
  if (rawArgs[0] === "ci") rawArgs = rawArgs.slice(1);
  if (rawArgs[0] === "init") rawArgs = rawArgs.slice(1);

  const opts = parseArgs(rawArgs);

  if (!opts.provider) {
    logError("--provider is required.");
    logFix(`Pick one: ci init --provider ${Object.keys(PROVIDERS).join(" | ")}`);
    process.exit(2);
  }
  const provider = PROVIDERS[opts.provider];
  if (!provider) {
    logError(`Unknown provider: ${opts.provider}`);
    logFix(`Supported providers: ${Object.keys(PROVIDERS).join(", ")}`);
    process.exit(2);
  }

  const rendered = renderTemplate(
    fs.readFileSync(path.join(CI_TEMPLATES, provider.template), "utf8"),
    { CSDA_VERSION: packageJson.version || "latest" }
  );

  if (opts.stdout) {
    process.stdout.write(rendered);
    process.exit(0);
  }

  const dest = path.join(opts.projectDir, provider.dest);
  if (fs.existsSync(dest) && !opts.force) {
    logError(`${provider.dest} already exists — refusing to overwrite.`);
    logFix("Re-run with --stdout and paste the spec-gate job into your existing config,");
    logFix("or pass --force to replace the file entirely.");
    process.exit(2);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, rendered, "utf8");
  logInfo(`write ${provider.dest}`);
  logInfo("✅ CI gate installed. The job:");
  logInfo("  1. runs `validate --strict-tdd` on every PR/MR (the L2 gate)");
  logInfo("  2. publishes `plan --format json` as the spec-plan artifact");
  logInfo("Commit the file and open a PR to see the gate in action.");
  process.exit(0);
}

main();
