#!/usr/bin/env node
"use strict";

/**
 * `done <REQ-id>` — update the Status of a requirement row in
 * docs/specs/traceability.md to a terminal state (Implemented by default).
 *
 * Optional `--check` runs `validate` first and aborts on failure so the
 * matrix never moves ahead of the gates.
 *
 *   csda done REQ-007
 *   csda done REQ-007 --status Verified
 *   csda done REQ-007 --check
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { resolveProjectDir } = require("./lib/project-root");
const { error } = require("./lib/diagnostics");
const { agentIo, EXIT } = require("./lib/agent");

const COLOR_ENABLED =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR_ENABLED ? "\x1b[0m" : "",
  bold: COLOR_ENABLED ? "\x1b[1m" : "",
  dim: COLOR_ENABLED ? "\x1b[2m" : "",
  red: COLOR_ENABLED ? "\x1b[31m" : "",
  green: COLOR_ENABLED ? "\x1b[32m" : "",
  yellow: COLOR_ENABLED ? "\x1b[33m" : "",
  cyan: COLOR_ENABLED ? "\x1b[36m" : "",
};

const VALIDATE_SCRIPT = path.join(__dirname, "validate_specs.js");

const ALLOWED_STATUSES = ["Draft", "Approved", "Implemented", "Verified", "Released", "Deprecated"];

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}✔ done${c.reset}  ${c.dim}— close the loop on a requirement${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    ${c.cyan}create-spec-driven-app done${c.reset} <REQ-id> [--status <Status>] [--project-dir <path>] [--check]\n\n` +
      `  ${c.bold}OPTIONS${c.reset}\n` +
      `    ${c.green}--status <Status>${c.reset}    ${c.dim}New status (default: Implemented).${c.reset}\n` +
      `                         ${c.dim}One of: ${ALLOWED_STATUSES.join(", ")}.${c.reset}\n` +
      `    ${c.green}--project-dir <path>${c.reset} ${c.dim}Project root (auto-detected from cwd if omitted).${c.reset}\n` +
      `    ${c.green}--check${c.reset}              ${c.dim}Run \`validate\` first; abort if it fails.${c.reset}\n` +
      `    ${c.green}--strict${c.reset}             ${c.dim}Like --check but uses \`validate --strict-tdd\`.${c.reset}\n` +
      `    ${c.green}-h, --help${c.reset}           ${c.dim}Show this help.${c.reset}\n\n` +
      `  ${c.bold}EXAMPLES${c.reset}\n` +
      `    ${c.yellow}$${c.reset} csda done REQ-007\n` +
      `    ${c.yellow}$${c.reset} csda done REQ-007 --status Verified --strict\n\n`
  );
}

function parseArgs(argv) {
  const opts: any = {
    reqId: null,
    status: "Implemented",
    projectDir: ".",
    check: false,
    strict: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--status" && argv[i + 1]) opts.status = argv[++i];
    else if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--check") opts.check = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--strict") {
      opts.strict = true;
      opts.check = true;
    } else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${a}\n`);
      process.exit(2);
    } else if (!opts.reqId) {
      opts.reqId = a;
    } else {
      process.stderr.write(`Unexpected positional argument: ${a}\n`);
      process.exit(2);
    }
  }
  return opts;
}

/**
 * Replace the Status cell of every row whose Requirement cell equals `reqId`.
 * Returns the new content and the number of rows updated.
 */
function setRequirementStatus(content, reqId, newStatus) {
  const lines = content.split("\n");
  let updated = 0;
  const out = lines.map((line) => {
    if (!line.startsWith("|")) return line;
    if (line.includes("---")) return line;
    // Skip header rows (rich + legacy)
    if (line.includes("| Requirement | Scenario ID |")) return line;
    if (line.includes("| Feature | Scenario |")) return line;

    const cells = line.split("|");
    // cells[0] and cells[cells.length-1] are empty (leading/trailing pipes).
    // Rich rows have: ["", " Req ", " Scn ", ..., " Status ", ""].
    if (cells.length < 4) return line;
    const reqCell = (cells[1] || "").trim();
    if (reqCell !== reqId) return line;

    const statusIdx = cells.length - 2;
    cells[statusIdx] = ` ${newStatus} `;
    updated++;
    return cells.join("|");
  });
  return { content: out.join("\n"), updated };
}

function runValidate(projectDir, strict) {
  const args = strict
    ? [VALIDATE_SCRIPT, projectDir, "--strict-tdd"]
    : [VALIDATE_SCRIPT, projectDir];
  return spawnSync(process.execPath, args, { encoding: "utf8" });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const io = agentIo(opts.json);
  const NULL_SHAPE = { requirement: null };

  if (!opts.reqId) {
    if (!io.json) usage();
    io.usage(NULL_SHAPE, [
      error("req_id_required", "REQ-id is required (e.g. REQ-007).", {
        fix: "Pass the requirement id: csda done REQ-007",
      }),
    ]);
  }
  if (!/^REQ-\d+$/.test(opts.reqId)) {
    io.usage(NULL_SHAPE, [
      error("req_id_malformed", `Invalid REQ-id: ${opts.reqId} (expected REQ-NNN).`, {
        target: opts.reqId,
        fix: "Use the REQ-NNN form, e.g. REQ-007.",
      }),
    ]);
  }
  if (!ALLOWED_STATUSES.includes(opts.status)) {
    io.usage(NULL_SHAPE, [
      error("status_not_allowed", `Invalid status: ${opts.status}.`, {
        target: opts.status,
        fix: `Use one of: ${ALLOWED_STATUSES.join(", ")}.`,
      }),
    ]);
  }

  let projectDir;
  try {
    projectDir = resolveProjectDir(opts.projectDir);
  } catch (err) {
    io.usage(NULL_SHAPE, [
      error("project_not_found", err.message, {
        fix: "Run from inside a spec-driven project, or pass --project-dir.",
      }),
    ]);
  }
  const tracePath = path.join(projectDir, "docs/specs/traceability.md");
  if (!fs.existsSync(tracePath)) {
    io.usage(NULL_SHAPE, [
      error("traceability_not_found", `docs/specs/traceability.md not found in ${projectDir}`, {
        file: "docs/specs/traceability.md",
        fix: "Scaffold it with `csda init`, or adopt the project with `csda adopt`.",
      }),
    ]);
  }

  if (opts.check) {
    const r = runValidate(projectDir, opts.strict);
    if (r.status !== 0) {
      const gate = opts.strict ? "validate --strict-tdd" : "validate";
      if (!io.json) {
        process.stderr.write(r.stdout || "");
        process.stderr.write(r.stderr || "");
      }
      io.fail(NULL_SHAPE, [
        error("validate_gate_failed", `${gate} failed; aborting status update.`, {
          fix: `Run \`csda ${gate} .\` and fix what it reports, then retry.`,
        }),
      ]);
    }
  }

  const original = fs.readFileSync(tracePath, "utf8");
  const { content, updated } = setRequirementStatus(original, opts.reqId, opts.status);

  if (updated === 0) {
    io.fail(NULL_SHAPE, [
      error("requirement_not_in_matrix", `${opts.reqId} not found in traceability.md.`, {
        target: opts.reqId,
        fix: `Add a row for ${opts.reqId} — \`csda req add\` writes one for you.`,
      }),
    ]);
  }

  fs.writeFileSync(tracePath, content, "utf8");
  io.emit({ requirement: { id: opts.reqId, status: opts.status, rowsUpdated: updated } }, () =>
    process.stdout.write(
      `${c.green}✔${c.reset}  ${c.bold}${opts.reqId}${c.reset} → ${c.bold}${opts.status}${c.reset} ${c.dim}(${updated} row${updated > 1 ? "s" : ""} updated)${c.reset}\n`
    )
  );
  process.exit(EXIT.OK);
}

if (require.main === module) main();

module.exports = { parseArgs, setRequirementStatus, ALLOWED_STATUSES };
