"use strict";

/**
 * The machine-facing half of every command, in one place.
 *
 * ADR-0017 fixes the contract: one JSON document on stdout per invocation,
 * prose to stderr, failures carrying the command's null-shape, camelCase keys,
 * and a fixed exit-code table. This module is the only implementation of it —
 * before it existed, `change` had its own copy and nothing else complied.
 *
 * A command wires itself in with three calls:
 *
 *   const io = agentIo(argv.includes("--json"));
 *   io.emit({ plan }, () => renderHumanPlan(plan));
 *   io.fail({ plan: null }, [error("no_project", "…", { fix: "…" })]);
 */

const { printDiagnostics, hasErrors } = require("./diagnostics");

/**
 * Exit codes are part of the published contract — an agent branches on them
 * before it parses anything. Success covers advisory warnings: a warning the
 * caller may ignore is not a failure.
 */
const EXIT = Object.freeze({
  OK: 0,
  FAILURE: 1,
  USAGE: 2,
  MISSING_PREREQUISITE: 3,
  CANCELLED: 130,
});

/**
 * `--json` and `--format json` mean the same thing. The second spelling
 * predates the contract (`plan --format json`) and keeps working: breaking it
 * would break every pipeline that already uses it.
 */
function wantsJson(argv) {
  const args = argv || [];
  if (args.includes("--json")) return true;
  const i = args.indexOf("--format");
  return i !== -1 && args[i + 1] === "json";
}

function writeJson(document) {
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
}

function agentIo(json) {
  return {
    json: Boolean(json),

    /**
     * Success. In JSON mode the payload is emitted with a `status` array of
     * diagnostics — empty when there is nothing to report, populated when the
     * command succeeded but has advisory warnings.
     */
    emit(payload, renderHuman) {
      if (json) {
        writeJson({ ...payload, status: payload.status || [] });
      } else if (renderHuman) {
        renderHuman();
      }
    },

    /**
     * Failure, exit 1. The null-shape matters: a consumer never has to tell
     * "the command failed" apart from "the command printed nothing", because
     * the document has the same keys either way.
     */
    fail(nullShape, diags) {
      if (json) {
        writeJson({ ...nullShape, status: diags });
      } else {
        printDiagnostics(diags);
      }
      process.exit(EXIT.FAILURE);
    },

    /** A malformed invocation — unknown flag, missing argument. Exit 2. */
    usage(nullShape, diags) {
      if (json) {
        writeJson({ ...nullShape, status: diags });
      } else {
        printDiagnostics(diags);
      }
      process.exit(EXIT.USAGE);
    },

    /**
     * Emit, then exit 1 if any diagnostic is an error. For commands that are
     * themselves gates: `validate` reports and fails in the same breath.
     */
    emitAndGate(payload, renderHuman) {
      this.emit(payload, renderHuman);
      if (hasErrors(payload.status || [])) process.exit(EXIT.FAILURE);
    },
  };
}

module.exports = { EXIT, wantsJson, agentIo };
