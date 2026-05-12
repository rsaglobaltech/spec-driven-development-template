"use strict";

/**
 * Pure module — no vscode dependency.
 * Spawns `create-spec-driven-app validate <projectDir>` and returns raw output.
 */

const { spawnSync } = require("node:child_process");

/**
 * Run the CLI validate command synchronously.
 * @param {string} projectDir  Absolute path to the spec-driven project
 * @param {string} cliPath     Command to invoke (default: "npx create-spec-driven-app")
 * @returns {{ exitCode: number, stdout: string, stderr: string, spawnError: string|null }}
 */
function runValidate(projectDir, cliPath = "npx create-spec-driven-app") {
  const parts = cliPath.trim().split(/\s+/);
  const cmd = parts[0];
  const prefixArgs = parts.slice(1);

  const result = spawnSync(cmd, [...prefixArgs, "validate", projectDir], {
    encoding: "utf8",
    timeout: 30_000,
    shell: process.platform === "win32",
  });

  return {
    exitCode: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    spawnError: result.error ? result.error.message : null,
  };
}

module.exports = { runValidate };
