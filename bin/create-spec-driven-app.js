#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const packageJson = require(path.join(rootDir, "package.json"));
const VERSION = packageJson.version || "0.0.0";
const initScript = path.join(rootDir, "scripts", "new_spec_project.sh");
const initNodeScript = path.join(rootDir, "scripts", "init_project.js");
const validateScript = path.join(rootDir, "scripts", "validate_specs.sh");
const expandScript = path.join(rootDir, "scripts", "expand_domain_pack.js");
const packInitScript = path.join(rootDir, "scripts", "init_pack.js");
const packLintScript = path.join(rootDir, "scripts", "lint_pack.js");

function info(msg) {
  process.stdout.write(`ℹ️ [INFO] ${msg}\n`);
}

function error(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

function usage() {
  process.stdout.write(
    `🚀 create-spec-driven-app\n\n` +
      `Usage:\n` +
      `  create-spec-driven-app init --config <path> --out <directory> [--force] [--dry-run] [--no-git] [--engine=shell (deprecated)]\n` +
      `  create-spec-driven-app validate <project_dir>\n` +
      `  create-spec-driven-app expand --pack-root <path> --pack <domain/type> --project-dir <path> [--var KEY=VALUE]... [--dry-run] [--no-examples]\n` +
      `  create-spec-driven-app pack init --out <directory> [--name <name>] [--type backend|frontend] [--dry-run]\n` +
      `  create-spec-driven-app pack lint --pack-root <path> --pack <domain/type>\n` +
      `  create-spec-driven-app --help\n` +
      `  create-spec-driven-app --version\n\n` +
      `Examples:\n` +
      `  npx create-spec-driven-app@latest init --config ./project.config --out ./projects\n` +
      `  npx create-spec-driven-app@latest validate ./projects/my-app\n` +
      `  npx create-spec-driven-app@latest expand --pack-root ./domain-packs --pack parking-management/backend --project-dir ./projects/my-app --var PROJECT_NAME="My App" --var PROJECT_SLUG=my-app --var DOMAIN="parking operations"\n` +
      `  npx create-spec-driven-app@latest pack init --out ./domain-packs --name "Billing Backend"\n` +
      `  npx create-spec-driven-app@latest pack lint --pack-root ./domain-packs --pack billing/backend\n`
  );
}

function ensureExecutable(scriptPath) {
  if (!fs.existsSync(scriptPath)) {
    error(`Required script not found: ${scriptPath}`);
    process.exit(3);
  }
}

function runScript(scriptPath, args) {
  const result = spawnSync(scriptPath, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    error(`Failed to execute script: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    error(`Process terminated by signal: ${result.signal}`);
    process.exit(1);
  }

  process.exit(typeof result.status === "number" ? result.status : 1);
}

function runNodeScript(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    error(`Failed to execute script: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    error(`Process terminated by signal: ${result.signal}`);
    process.exit(1);
  }

  process.exit(typeof result.status === "number" ? result.status : 1);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    usage();
    process.exit(0);
  }

  if (args[0] === "--version" || args[0] === "-v") {
    process.stdout.write(`${VERSION}\n`);
    process.exit(0);
  }

  const command = args[0];

  if (command === "init") {
    const passThrough = args.slice(1);
    // Detect explicit --engine=shell or --engine shell (deprecated).
    const engineIdx = passThrough.indexOf("--engine");
    const shellByFlag = passThrough.includes("--engine=shell") ||
      (engineIdx !== -1 && passThrough[engineIdx + 1] === "shell");
    if (shellByFlag) {
      process.stderr.write(
        "⚠️ [WARN] --engine=shell is deprecated and will be removed in a future release. " +
        "The Node.js engine (--engine=node) is now the default.\n"
      );
      ensureExecutable(initScript);
      runScript(initScript, passThrough);
    } else {
      ensureExecutable(initNodeScript);
      runNodeScript(initNodeScript, passThrough);
    }
    return;
  }

  if (command === "validate") {
    ensureExecutable(validateScript);

    if (args.length !== 2) {
      error(`'validate' expects exactly one argument: <project_dir>`);
      usage();
      process.exit(2);
    }

    runScript(validateScript, [args[1]]);
    return;
  }

  if (command === "expand") {
    ensureExecutable(expandScript);
    const passThrough = args.slice(1);
    runNodeScript(expandScript, passThrough);
    return;
  }

  if (command === "pack") {
    const subCommand = args[1];
    if (subCommand === "init") {
      ensureExecutable(packInitScript);
      runNodeScript(packInitScript, args.slice(1));
      return;
    }
    if (subCommand === "lint") {
      ensureExecutable(packLintScript);
      runNodeScript(packLintScript, args.slice(1));
      return;
    }
    error(`Unknown pack sub-command: ${subCommand || "(none)"}. Expected: init, lint`);
    usage();
    process.exit(2);
  }

  info(`Unknown command: ${command}`);
  usage();
  process.exit(2);
}

main();
