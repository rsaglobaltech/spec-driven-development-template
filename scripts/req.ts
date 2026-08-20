#!/usr/bin/env node

/**
 * `req` — manage requirement rows in docs/specs/traceability.md without ever
 * hand-editing the 10-column markdown table.
 *
 *   csda req                          # interactive picker (TTY)
 *   csda req list                     # readable view, not raw pipes
 *   csda req add "<title>"            # append a row, auto-assign REQ-NNN/SCN-NNN
 *   csda req link REQ-007 --test ...  # fill columns (feature/test/code/uc/...)
 *   csda req done REQ-007 [--check]   # status transition (wraps `done`)
 *
 * Pure helpers (parseTraceability via plan.js, nextReqId, buildRow,
 * appendRequirement, updateRequirementFields) are unit-tested; CLI behaviour is
 * covered end-to-end in tests/cli.test.ts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { resolveProjectDir } from "./lib/project-root";
import { parseTraceability } from "./plan";
import { agentIo, wantsJson } from "./lib/agent";
import { error, errorMessage } from "./lib/diagnostics";

const DONE_SCRIPT = path.join(__dirname, "done.js");

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

const RICH_HEADER =
  "| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |";
const RICH_SEP = "|---|---|---|---|---|---|---|---|---|---|";

// Rich-row cell indices (line.split("|") → ["", req, scn, ..., status, ""]).
const COL = {
  requirement: 1,
  scenarioId: 2,
  featureFile: 3,
  useCase: 4,
  command: 5,
  aggregate: 6,
  event: 7,
  technicalArtifact: 8,
  testArtifact: 9,
  status: 10,
};

// Maps `--flag` → row field for `link`.
const LINK_FIELDS = {
  "--feature": "featureFile",
  "--uc": "useCase",
  "--cmd": "command",
  "--agg": "aggregate",
  "--evt": "event",
  "--code": "technicalArtifact",
  "--test": "testArtifact",
  "--scenario": "scenarioId",
};

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}📝 req${c.reset}  ${c.dim}— manage requirements without editing the matrix by hand${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    ${c.cyan}csda req${c.reset}                              ${c.dim}Interactive picker (TTY).${c.reset}\n` +
      `    ${c.cyan}csda req list${c.reset}                         ${c.dim}Readable view of every requirement.${c.reset}\n` +
      `    ${c.cyan}csda req add${c.reset} "<title>"                ${c.dim}Append a row; auto-assign REQ-NNN.${c.reset}\n` +
      `    ${c.cyan}csda req link${c.reset} <REQ> [field flags]     ${c.dim}Fill columns for a requirement.${c.reset}\n` +
      `    ${c.cyan}csda req done${c.reset} <REQ> [--check]         ${c.dim}Mark Implemented (wraps \`done\`).${c.reset}\n\n` +
      `  ${c.bold}FIELD FLAGS (add / link)${c.reset}\n` +
      `    ${c.green}--feature <path>${c.reset}   ${c.dim}Gherkin .feature file.${c.reset}\n` +
      `    ${c.green}--test <path>${c.reset}      ${c.dim}Test artifact.${c.reset}\n` +
      `    ${c.green}--code <path>${c.reset}      ${c.dim}Production / technical artifact.${c.reset}\n` +
      `    ${c.green}--uc <id>${c.reset}          ${c.dim}Use Case id (UC-NNN).${c.reset}\n` +
      `    ${c.green}--cmd / --agg / --evt${c.reset} ${c.dim}Command/Query, Aggregate, Event.${c.reset}\n` +
      `    ${c.green}--scenario <id>${c.reset}    ${c.dim}Override the auto Scenario ID.${c.reset}\n` +
      `    ${c.green}--status <Status>${c.reset}  ${c.dim}Initial status for \`add\` (default: Draft).${c.reset}\n\n` +
      `  ${c.bold}GLOBAL${c.reset}\n` +
      `    ${c.green}--project-dir <path>${c.reset} ${c.dim}Project root (auto-detected from cwd if omitted).${c.reset}\n` +
      `    ${c.green}--yes${c.reset}                ${c.dim}Non-interactive; never prompt.${c.reset}\n` +
      `    ${c.green}-h, --help${c.reset}           ${c.dim}Show this help.${c.reset}\n\n` +
      `  ${c.bold}EXAMPLES${c.reset}\n` +
      `    ${c.yellow}$${c.reset} csda req add "Driver pays for a parking session"\n` +
      `    ${c.yellow}$${c.reset} csda req link REQ-007 --feature features/billing/pay.feature --test src/test/PayTest.java\n` +
      `    ${c.yellow}$${c.reset} csda req done REQ-007 --check\n\n`
  );
}

// ── Pure helpers ──────────────────────────────────────────────────────────────────

function pad3(n) {
  return String(n).padStart(3, "0");
}

/** Highest REQ-NNN in the matrix + 1, formatted REQ-NNN. Starts at REQ-001. */
function nextReqId(rows) {
  let max = 0;
  for (const r of rows) {
    const m = (r.requirement || "").match(/^REQ-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `REQ-${pad3(max + 1)}`;
}

/** Highest SCN-NNN + 1. */
function nextScenarioId(rows) {
  let max = 0;
  for (const r of rows) {
    const m = (r.scenarioId || "").match(/^SCN-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `SCN-${pad3(max + 1)}`;
}

/** Build a rich-matrix row string from a fields object. Missing cells → "-". */
function buildRow(fields) {
  const cell = (v) => {
    const s = (v == null ? "" : String(v)).trim();
    return s === "" ? "-" : s;
  };
  const ordered = [
    fields.requirement,
    fields.scenarioId,
    fields.featureFile,
    fields.useCase,
    fields.command,
    fields.aggregate,
    fields.event,
    fields.technicalArtifact,
    fields.testArtifact,
    fields.status || "Draft",
  ];
  return `| ${ordered.map(cell).join(" | ")} |`;
}

/** True for a parsed/printed row line in the rich matrix (skips headers/seps). */
function isMatrixDataLine(line) {
  if (!line.startsWith("|")) return false;
  if (line.includes("---")) return false;
  if (line.includes("| Requirement | Scenario ID |")) return false;
  if (line.includes("| Feature | Scenario |")) return false;
  return true;
}

/**
 * Append a requirement row. Auto-assigns REQ-NNN and SCN-NNN unless supplied.
 * Inserts the rich header+separator if no matrix exists yet.
 * Returns { content, reqId, scenarioId }.
 */
function appendRequirement(content, fields) {
  const rows = parseTraceability(content);
  const reqId = fields.requirement || nextReqId(rows);
  const scenarioId = fields.scenarioId || nextScenarioId(rows);
  const row = buildRow({ ...fields, requirement: reqId, scenarioId });

  let out = content.replace(/\s*$/, "");
  if (!content.includes("| Requirement | Scenario ID |")) {
    out += `\n\n${RICH_HEADER}\n${RICH_SEP}`;
  }
  out += `\n${row}\n`;
  return { content: out, reqId, scenarioId };
}

/**
 * Update one or more column cells of every row matching `reqId`.
 * `fields` is keyed by the field names in COL (e.g. { testArtifact, featureFile }).
 * Returns { content, updated }.
 */
function updateRequirementFields(content, reqId, fields) {
  const keys = Object.keys(fields).filter((k) => k in COL && fields[k] != null);
  if (keys.length === 0) return { content, updated: 0 };

  let updated = 0;
  const out = content.split("\n").map((line) => {
    if (!isMatrixDataLine(line)) return line;
    const cells = line.split("|");
    if (cells.length < 12) return line;
    if ((cells[COL.requirement] || "").trim() !== reqId) return line;
    for (const k of keys) {
      cells[COL[k]] = ` ${String(fields[k]).trim()} `;
    }
    updated++;
    return cells.join("|");
  });
  return { content: out.join("\n"), updated };
}

// ── IO-bound command handlers ────────────────────────────────────────────────────

function readMatrix(tracePath) {
  if (!fs.existsSync(tracePath)) {
    process.stderr.write(
      `${c.red}✖${c.reset}  docs/specs/traceability.md not found.\n` +
        `   ${c.dim}Run \`csda init\` first, or pass --project-dir to an existing project.${c.reset}\n`
    );
    process.exit(2);
  }
  return fs.readFileSync(tracePath, "utf8");
}

/**
 * A matrix cell that carries information, or `null`. The placeholders `-` and
 * `TBD` mean "not filled in yet" — emitting them as strings would make an
 * agent treat an empty cell as a path.
 */
function meaningfulCell(value) {
  if (!value || value === "-" || String(value).toUpperCase() === "TBD") return null;
  return value;
}

function cmdList(tracePath, io?) {
  const rows = parseTraceability(readMatrix(tracePath));
  const reqs = rows.filter((r) => /^REQ-\d+/.test(r.requirement || ""));

  // `req list --json` used to print the human table and ignore the flag, which
  // is worse than rejecting it: an agent asks for a document and gets prose.
  if (io && io.json) {
    io.emit({
      requirements: reqs.map((r) => ({
        id: r.requirement || null,
        scenarioId: r.scenarioId || null,
        status: r.status || "Draft",
        featureFile: meaningfulCell(r.featureFile),
        testArtifact: meaningfulCell(r.testArtifact),
        technicalArtifact: meaningfulCell(r.technicalArtifact),
      })),
    });
    return 0;
  }

  if (reqs.length === 0) {
    process.stdout.write(
      `\n  ${c.dim}No requirements yet. Add one: csda req add "…"${c.reset}\n\n`
    );
    return 0;
  }
  process.stdout.write(
    `\n  ${c.bold}📝 Requirements${c.reset} ${c.dim}(${reqs.length})${c.reset}\n\n`
  );
  for (const r of reqs) {
    const meaningful = (v) => meaningfulCell(v) !== null;
    process.stdout.write(
      `    ${c.cyan}${(r.requirement || "").padEnd(9)}${c.reset} ${c.dim}${r.scenarioId || ""}${c.reset}  ${statusColor(r.status)}${r.status || "Draft"}${c.reset}\n`
    );
    if (meaningful(r.featureFile))
      process.stdout.write(`      ${c.dim}feature: ${r.featureFile}${c.reset}\n`);
    if (meaningful(r.testArtifact))
      process.stdout.write(`      ${c.dim}test:    ${r.testArtifact}${c.reset}\n`);
    if (meaningful(r.technicalArtifact))
      process.stdout.write(`      ${c.dim}code:    ${r.technicalArtifact}${c.reset}\n`);
  }
  process.stdout.write(
    `\n  ${c.dim}Next: csda req link <REQ> --test … · csda req done <REQ>${c.reset}\n\n`
  );
  return 0;
}

function statusColor(status) {
  if (["Implemented", "Verified", "Released"].includes(status)) return c.green;
  if (status === "Draft" || !status) return c.yellow;
  return c.reset;
}

function collectFieldFlags(argv) {
  // Returns { fields, status, rest } parsed from --feature/--test/... flags.
  const fields: Record<string, string> = {};
  let status = null;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a in LINK_FIELDS && argv[i + 1] != null) {
      fields[LINK_FIELDS[a]] = argv[++i];
    } else if (a === "--status" && argv[i + 1] != null) {
      status = argv[++i];
    } else {
      rest.push(a);
    }
  }
  return { fields, status, rest };
}

function cmdAdd(tracePath, argv) {
  const { fields, status, rest } = collectFieldFlags(argv);
  const title = rest
    .filter((a) => !a.startsWith("-"))
    .join(" ")
    .trim();
  // The title lands in the Use Case cell when --uc is not given, so the row is
  // human-readable; the structured UC id can be linked later.
  if (!title && !fields.useCase) {
    process.stderr.write(
      `${c.red}✖${c.reset}  A title is required: csda req add "<what the requirement does>"\n`
    );
    return 2;
  }
  if (title && !fields.useCase) fields.useCase = title;

  const original = readMatrix(tracePath);
  const { content, reqId, scenarioId } = appendRequirement(original, { ...fields, status });
  fs.writeFileSync(tracePath, content, "utf8");
  process.stdout.write(
    `${c.green}✔${c.reset}  Added ${c.bold}${reqId}${c.reset} ${c.dim}(${scenarioId}, status ${status || "Draft"})${c.reset}\n` +
      `   ${c.dim}Next: csda req link ${reqId} --feature <path> --test <path>${c.reset}\n`
  );
  return 0;
}

function cmdLink(tracePath, argv) {
  const { fields, rest } = collectFieldFlags(argv);
  const reqId = rest.find((a) => /^REQ-\d+$/.test(a));
  if (!reqId) {
    process.stderr.write(
      `${c.red}✖${c.reset}  Expected a REQ-id: csda req link REQ-007 --test …\n`
    );
    return 2;
  }
  if (Object.keys(fields).length === 0) {
    process.stderr.write(
      `${c.red}✖${c.reset}  Nothing to link. Pass at least one field flag (--feature/--test/--code/--uc/…).\n`
    );
    return 2;
  }
  const original = readMatrix(tracePath);
  const { content, updated } = updateRequirementFields(original, reqId, fields);
  if (updated === 0) {
    process.stderr.write(
      `${c.red}✖${c.reset}  ${reqId} not found in traceability.md.\n` +
        `   ${c.dim}List existing: csda req list${c.reset}\n`
    );
    return 1;
  }
  fs.writeFileSync(tracePath, content, "utf8");
  const set = Object.keys(fields)
    .map((k) => `${k}=${fields[k]}`)
    .join(", ");
  process.stdout.write(
    `${c.green}✔${c.reset}  ${c.bold}${reqId}${c.reset} ${c.dim}updated: ${set}${c.reset}\n`
  );
  return 0;
}

function cmdDone(projectDir, argv) {
  // Thin wrapper around the existing `done` script so status logic lives in one
  // place (validation gates, allowed statuses).
  const args = [DONE_SCRIPT, ...argv, "--project-dir", projectDir];
  const r = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  return typeof r.status === "number" ? r.status : 1;
}

// ── Interactive picker ────────────────────────────────────────────────────────────

async function interactive(tracePath, projectDir) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    cmdList(tracePath);
    const action = (
      await rl.question(
        `  Action [${c.bold}a${c.reset}dd / ${c.bold}l${c.reset}ink / ${c.bold}d${c.reset}one / ${c.bold}q${c.reset}uit]: `
      )
    )
      .trim()
      .toLowerCase();
    if (action === "a" || action === "add") {
      const title = (await rl.question("  Title: ")).trim();
      rl.close();
      return cmdAdd(tracePath, [title]);
    }
    if (action === "l" || action === "link") {
      const reqId = (await rl.question("  REQ-id: ")).trim();
      const feature = (await rl.question("  Feature path (blank to skip): ")).trim();
      const test = (await rl.question("  Test path (blank to skip): ")).trim();
      rl.close();
      const argv = [reqId];
      if (feature) argv.push("--feature", feature);
      if (test) argv.push("--test", test);
      return cmdLink(tracePath, argv);
    }
    if (action === "d" || action === "done") {
      const reqId = (await rl.question("  REQ-id: ")).trim();
      rl.close();
      return cmdDone(projectDir, [reqId]);
    }
    rl.close();
    return 0;
  } catch (err) {
    rl.close();
    process.stderr.write(`${c.red}✖${c.reset}  ${errorMessage(err)}\n`);
    return 1;
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────────

function extractProjectDir(argv) {
  const i = argv.indexOf("--project-dir");
  if (i !== -1 && argv[i + 1]) {
    const dir = argv[i + 1];
    argv.splice(i, 2);
    return dir;
  }
  return ".";
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(0);
  }
  const noPrompt = argv.includes("--yes");
  if (noPrompt) argv.splice(argv.indexOf("--yes"), 1);

  const io = agentIo(wantsJson(argv));
  // Strip the flag before sub-command dispatch, which treats a leading dash as
  // an unknown argument.
  for (const flag of ["--json"]) {
    const i = argv.indexOf(flag);
    if (i !== -1) argv.splice(i, 1);
  }

  const explicitDir = extractProjectDir(argv);
  let projectDir;
  try {
    projectDir = resolveProjectDir(explicitDir);
  } catch (err) {
    io.usage({ requirements: [] }, [
      error("no_project", errorMessage(err), {
        fix: "Run from inside a spec-driven project, or pass --project-dir <path>.",
      }),
    ]);
    return;
  }
  const tracePath = path.join(projectDir, "docs/specs/traceability.md");

  const sub = argv[0];
  let code;
  if (!sub) {
    if (process.stdin.isTTY && process.stdout.isTTY && !noPrompt && !io.json) {
      code = await interactive(tracePath, projectDir);
    } else {
      code = cmdList(tracePath, io);
    }
  } else if (sub === "list") {
    code = cmdList(tracePath, io);
  } else if (sub === "add") {
    code = cmdAdd(tracePath, argv.slice(1));
  } else if (sub === "link") {
    code = cmdLink(tracePath, argv.slice(1));
  } else if (sub === "done") {
    code = cmdDone(projectDir, argv.slice(1));
  } else {
    process.stderr.write(
      `${c.red}✖${c.reset}  Unknown req sub-command: ${sub}. Expected: list, add, link, done.\n`
    );
    usage();
    code = 2;
  }
  process.exit(code);
}

if (require.main === module) main();

export { nextReqId, nextScenarioId, buildRow, appendRequirement, updateRequirementFields, COL };
