"use strict";

/**
 * Reader for `harness.config.yaml` — optional per-project defaults for
 * `csda harness run`, so the test command and agent invocation do not have
 * to be retyped on every run.
 *
 * Format:
 *   harness_version: 1
 *   agent: "claude -p < {prompt_file}"
 *   test_cmd: "npm test"
 *   max_attempts: 3
 *
 * Every key is optional. CLI flags always override the file.
 *
 * Pure module: no logging, no process.exit. Throws on malformed YAML.
 */

const fs = require("node:fs");
const path = require("node:path");
const { parseYamlLite } = require("../domain-pack/common");

const HARNESS_CONFIG_FILE = "harness.config.yaml";

function readHarnessConfig(projectDir) {
  const filePath = path.join(projectDir, HARNESS_CONFIG_FILE);
  if (!fs.existsSync(filePath)) return null;

  const parsed = parseYamlLite(fs.readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${HARNESS_CONFIG_FILE}: root must be a mapping`);
  }

  const config: any = {};
  if (parsed.agent !== undefined) config.agent = String(parsed.agent);
  if (parsed.test_cmd !== undefined) config.testCmd = String(parsed.test_cmd);
  if (parsed.max_attempts !== undefined) {
    const n = Number(parsed.max_attempts);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`Invalid ${HARNESS_CONFIG_FILE}: max_attempts must be a positive integer`);
    }
    config.maxAttempts = n;
  }
  return config;
}

/**
 * Merge file config with CLI args. CLI wins on every key; the file fills gaps.
 */
function resolveHarnessSettings(fileConfig, cliArgs) {
  const file = fileConfig || {};
  return {
    agent: cliArgs.agent || file.agent || "",
    testCmd: cliArgs.testCmd || file.testCmd || "",
    maxAttempts: cliArgs.maxAttempts || file.maxAttempts || 3,
  };
}

module.exports = { HARNESS_CONFIG_FILE, readHarnessConfig, resolveHarnessSettings };
