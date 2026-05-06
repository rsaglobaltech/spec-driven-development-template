#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const packageJson = require(path.join(rootDir, 'package.json'));
const VERSION = packageJson.version || '0.0.0';
const initScript = path.join(rootDir, 'scripts', 'new_spec_project.sh');
const validateScript = path.join(rootDir, 'scripts', 'validate_specs.sh');

function info(msg) {
  process.stdout.write(`ℹ️ [INFO] ${msg}\n`);
}

function error(msg) {
  process.stderr.write(`❌ [ERROR] ${msg}\n`);
}

function usage() {
  process.stdout.write(`🚀 create-spec-driven-app\n\n` +
    `Usage:\n` +
    `  create-spec-driven-app init --config <path> --out <directory> [--force] [--dry-run] [--no-git]\n` +
    `  create-spec-driven-app validate <project_dir>\n` +
    `  create-spec-driven-app --help\n` +
    `  create-spec-driven-app --version\n\n` +
    `Examples:\n` +
    `  npx create-spec-driven-app@latest init --config ./project.config --out ./projects\n` +
    `  npx create-spec-driven-app@latest validate ./projects/my-app\n`);
}

function ensureExecutable(scriptPath) {
  if (!fs.existsSync(scriptPath)) {
    error(`Required script not found: ${scriptPath}`);
    process.exit(3);
  }
}

function runScript(scriptPath, args) {
  const result = spawnSync(scriptPath, args, {
    stdio: 'inherit',
    env: process.env
  });

  if (result.error) {
    error(`Failed to execute script: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    error(`Process terminated by signal: ${result.signal}`);
    process.exit(1);
  }

  process.exit(typeof result.status === 'number' ? result.status : 1);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    usage();
    process.exit(0);
  }

  if (args[0] === '--version' || args[0] === '-v') {
    process.stdout.write(`${VERSION}\n`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'init') {
    ensureExecutable(initScript);
    const passThrough = args.slice(1);
    runScript(initScript, passThrough);
    return;
  }

  if (command === 'validate') {
    ensureExecutable(validateScript);

    if (args.length !== 2) {
      error(`'validate' expects exactly one argument: <project_dir>`);
      usage();
      process.exit(2);
    }

    runScript(validateScript, [args[1]]);
    return;
  }

  info(`Unknown command: ${command}`);
  usage();
  process.exit(2);
}

main();
