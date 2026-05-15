"use strict";

/**
 * Reader for `harness.config.yaml` — optional per-project defaults for
 * `csda harness run`, so the test command and agent invocation do not have
 * to be retyped on every run.
 *
 * Format:
 *   harness_version: 1
 *   agent: "opencode run \"$(cat {prompt_file})\""
 *   test_cmd: "mvn -B test"
 *   max_attempts: 3
 *   prompt_prefix: "Role: Lead Architect. Hexagonal arch is non-negotiable."
 *   # or, for a multi-line prefix (parseYamlLite has no block scalar support):
 *   prompt_prefix_file: ./.harness/prompt-prefix.md
 *
 * `prompt_prefix` is prepended to every per-requirement prompt the harness
 * hands the agent. It is the natural home for your universal Role / Active
 * Project Boundary / Execution Policy directives — the bits a hand-crafted
 * "base prompt" used to carry — so they ride along on every REQ without
 * being duplicated.
 *
 * Every key is optional. CLI flags always override the file.
 *
 * Pure-ish module: reads `prompt_prefix_file` when present. No logging, no
 * process.exit. Throws on malformed YAML or a missing prefix file.
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

  // prompt_prefix_file wins over inline prompt_prefix when both are set —
  // file is the realistic source for the multi-line bootstrap directives.
  if (parsed.prompt_prefix_file !== undefined) {
    const rel = String(parsed.prompt_prefix_file);
    const abs = path.resolve(projectDir, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(
        `${HARNESS_CONFIG_FILE}: prompt_prefix_file not found at ${rel} (resolved to ${abs})`
      );
    }
    config.promptPrefix = fs.readFileSync(abs, "utf8");
  } else if (parsed.prompt_prefix !== undefined) {
    config.promptPrefix = String(parsed.prompt_prefix);
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
    promptPrefix: cliArgs.promptPrefix || file.promptPrefix || "",
  };
}

module.exports = { HARNESS_CONFIG_FILE, readHarnessConfig, resolveHarnessSettings };
