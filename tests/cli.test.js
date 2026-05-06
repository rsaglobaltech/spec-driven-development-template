const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLI_PATH = path.join(ROOT_DIR, 'bin', 'create-spec-driven-app.js');
const PKG = require(path.join(ROOT_DIR, 'package.json'));

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    ...options
  });
}

test('shows help with no args', () => {
  const result = runCli([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /create-spec-driven-app/);
  assert.match(result.stdout, /Usage:/);
});

test('shows version from package.json', () => {
  const result = runCli(['--version']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), PKG.version);
});

test('returns usage error for unknown command', () => {
  const result = runCli(['unknown-cmd']);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /Unknown command/);
});

test('runs init in dry-run mode with example config', () => {
  const result = runCli([
    'init',
    '--config',
    'examples/project.config.example',
    '--out',
    os.tmpdir(),
    '--dry-run',
    '--no-git',
    '--force'
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[dry-run\] project would be generated at:/);
  assert.match(result.stdout, /Generation completed/);
});

test('returns usage error for validate without project dir', () => {
  const result = runCli(['validate']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /expects exactly one argument/);
});

test('can init and validate a generated project end-to-end', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'csda-e2e-'));
  const slug = `spec-driven-${Date.now()}`;
  const configPath = path.join(tempRoot, 'project.config');
  const projectDir = path.join(tempRoot, slug);

  const config = [
    'PROJECT_NAME="E2E Spec Driven"',
    `PROJECT_SLUG="${slug}"`,
    'PROJECT_TYPE="backend"',
    'DOMAIN="automation testing"',
    'LANG="en"',
    'MODULES="auth"'
  ].join('\n');

  fs.writeFileSync(configPath, `${config}\n`, 'utf8');

  const initResult = runCli([
    'init',
    '--config',
    configPath,
    '--out',
    tempRoot,
    '--force',
    '--no-git'
  ]);

  assert.equal(initResult.status, 0);
  assert.ok(fs.existsSync(projectDir), 'project directory should exist');

  const validateResult = runCli(['validate', projectDir]);
  assert.equal(validateResult.status, 0);
  assert.match(validateResult.stdout, /Validation passed/);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
