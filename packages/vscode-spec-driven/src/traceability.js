"use strict";

/**
 * Pure module — no vscode dependency.
 * Utilities for locating and navigating requirement IDs inside spec-driven
 * projects (traceability matrix, pack.yaml, spec.md, feature files).
 */

// Matches REQ-001, UC-001, SCN-001, BC-001, AGG-001, EVT-001, RUL-001, CMD-001
const ID_PATTERN = /\b(REQ|UC|SCN|BC|AGG|EVT|RUL|CMD)-\d{3,}\b/g;

/**
 * Find all requirement-style IDs in a block of text.
 * @param {string} text
 * @returns {{ id: string, line: number, col: number, endCol: number }[]}
 */
function findRequirementIds(text) {
  const results = [];
  const lines = text.split("\n");
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    ID_PATTERN.lastIndex = 0;
    let match;
    while ((match = ID_PATTERN.exec(line)) !== null) {
      results.push({
        id: match[0],
        line: lineIdx,
        col: match.index,
        endCol: match.index + match[0].length,
      });
    }
  }
  return results;
}

/**
 * Locate a requirement ID inside a traceability markdown document.
 * Returns the 0-based line number, or -1 if not found.
 * @param {string} traceContent
 * @param {string} id  e.g. "REQ-001"
 * @returns {number}
 */
function findIdInTraceability(traceContent, id) {
  const lines = traceContent.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(id)) return i;
  }
  return -1;
}

/**
 * Parse the stdout/stderr of `create-spec-driven-app validate <dir>`.
 * Returns an array of diagnostic-like objects.
 * @param {string} stdout
 * @param {string} stderr
 * @returns {{ message: string, severity: "error"|"warning"|"info" }[]}
 */
function parseValidateOutput(stdout, stderr) {
  const combined = [(stdout || ""), (stderr || "")].join("\n");
  const diagnostics = [];

  for (const raw of combined.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes("[ERROR]") || line.includes("❌")) {
      diagnostics.push({
        message: line.replace(/^.*(?:\[ERROR\]|❌)\s*/, "").trim(),
        severity: "error",
      });
    } else if (line.includes("[WARN]") || line.includes("⚠️")) {
      diagnostics.push({
        message: line.replace(/^.*(?:\[WARN\]|⚠️)\s*/, "").trim(),
        severity: "warning",
      });
    } else if (line.includes("[INFO]") && line.includes("✅")) {
      diagnostics.push({
        message: line.replace(/^.*(?:\[INFO\]|ℹ️)\s*/, "").trim(),
        severity: "info",
      });
    }
  }

  return diagnostics;
}

module.exports = { findRequirementIds, findIdInTraceability, parseValidateOutput };
