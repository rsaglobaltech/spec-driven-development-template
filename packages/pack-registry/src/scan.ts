"use strict";

/**
 * Pure module — no fs side effects on the output side.
 * Scans a packs/ root and returns metadata for each pack found.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const CLI = path.join(REPO_ROOT, "bin/create-spec-driven-app.js");

const { loadPack } = require("../../../scripts/domain-pack/common");

/**
 * @typedef {{ id: string, name: string, version: string, language: string,
 *   project_type: string, requirements: number, useCases: number,
 *   aggregates: number, events: number, scenarios: number, lintStatus: "pass"|"warn"|"fail",
 *   lintMessages: string[] }} PackMetadata
 */

/**
 * Scan a directory of packs and return metadata for each.
 * @param {string} packsRoot
 * @returns {PackMetadata[]}
 */
function scanPacks(packsRoot) {
  if (!fs.existsSync(packsRoot)) {
    throw new Error(`packsRoot does not exist: ${packsRoot}`);
  }

  const packs = [];
  for (const entry of fs.readdirSync(packsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const domainDir = path.join(packsRoot, entry.name);
    for (const sub of fs.readdirSync(domainDir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const packYaml = path.join(domainDir, sub.name, "pack.yaml");
      if (!fs.existsSync(packYaml)) continue;
      const id = `${entry.name}/${sub.name}`;
      packs.push(buildMetadata(packsRoot, id));
    }
  }
  return packs.sort((a, b) => a.id.localeCompare(b.id));
}

/** @returns {PackMetadata} */
function buildMetadata(packsRoot, id) {
  let pack;
  try {
    pack = loadPack(packsRoot, id).pack;
  } catch (err) {
    return {
      id,
      name: id,
      version: "?",
      language: "?",
      project_type: "?",
      requirements: 0,
      useCases: 0,
      aggregates: 0,
      events: 0,
      scenarios: 0,
      lintStatus: "fail",
      lintMessages: [`Could not load pack.yaml: ${err.message}`],
    };
  }

  const lint = runLint(packsRoot, id);
  const meta = pack.metadata || {};

  return {
    id,
    name: meta.name || id,
    version: meta.version || "0.0.0",
    language: meta.language || "en",
    project_type: meta.project_type || "backend",
    requirements: count(pack.requirements),
    useCases: count(pack.use_cases),
    aggregates: count(pack.aggregates),
    events: count(pack.events),
    scenarios: count(pack.scenarios),
    lintStatus: lint.status,
    lintMessages: lint.messages,
  };
}

function count(arr) {
  return Array.isArray(arr) ? arr.length : 0;
}

function runLint(packsRoot, id) {
  const result = spawnSync(
    process.execPath,
    [CLI, "pack", "lint", "--pack-root", packsRoot, "--pack", id],
    {
      encoding: "utf8",
      timeout: 15_000,
    }
  );
  const combined = (result.stdout || "") + "\n" + (result.stderr || "");
  const errors = [];
  const warnings = [];
  for (const line of combined.split("\n")) {
    if (line.includes("[ERROR]")) errors.push(line.replace(/^.*\[ERROR\]\s*/, "").trim());
    else if (line.includes("[WARN]")) warnings.push(line.replace(/^.*\[WARN\]\s*/, "").trim());
  }
  let status;
  if (errors.length > 0) status = "fail";
  else if (warnings.length > 0) status = "warn";
  else status = "pass";
  return { status, messages: [...errors, ...warnings] };
}

module.exports = { scanPacks, buildMetadata };
