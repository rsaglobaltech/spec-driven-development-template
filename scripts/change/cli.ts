#!/usr/bin/env node
/**
 * `csda change <sub>` — the change lifecycle.
 *
 *   new · list · show · status · validate · archive
 *
 * Every subcommand accepts `--json` and, in that mode, prints exactly one JSON
 * document on stdout while prose goes to stderr. Failures print the command's
 * null-shape plus a `status` array of diagnostics and exit 1. That contract is
 * what lets an agent drive this without screen-scraping.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { resolveProjectDir } from "../lib/project-root";
import { error, warning, hasErrors, printDiagnostics } from "../lib/diagnostics";
import { agentIo } from "../lib/agent";
import { phrases } from "../lib/language";
import { ARTIFACTS, artifactState } from "./artifacts";
import { validateDelta } from "./delta";
import { parseDelta } from "./parser";
import { planArchive, executeArchive } from "./archive";
import {
  CHANGE_ID_RE,
  CHANGE_CONFIG_FILE,
  DEFAULT_CONFIG,
  paths,
  listChangeIds,
  listArchivedIds,
  listDeltas,
  readConfig,
  renderConfig,
  reserveReqRange,
  taskProgress,
  changeStatusLabel,
} from "./common";
import { main as instructionsMain } from "./instructions";

const COLOR_ENABLED =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR_ENABLED ? "\x1b[0m" : "",
  bold: COLOR_ENABLED ? "\x1b[1m" : "",
  dim: COLOR_ENABLED ? "\x1b[2m" : "",
  green: COLOR_ENABLED ? "\x1b[32m" : "",
  yellow: COLOR_ENABLED ? "\x1b[33m" : "",
  cyan: COLOR_ENABLED ? "\x1b[36m" : "",
  red: COLOR_ENABLED ? "\x1b[31m" : "",
};

// The artefact graph. Dependencies are enablers, not gates: `requires` says
// what makes an artefact *possible*, never what the author must do next.
// F3 makes this configurable per schema; for now the built-in is the default.

/** The skeletons `change new` writes, shared with `change instructions`. */
export const TEMPLATES = {
  proposal: (changeId) => templateProposal(changeId),
  tasks: () => templateTasks(),
  design: (changeId) => templateDesign(changeId),
  specs: (_changeId, projectDir?) => templateDelta("<capability>", "REQ-NNN", projectDir),
};

function usage() {
  process.stdout.write(
    `\n  ${c.bold}${c.cyan}🔄 change${c.reset}  ${c.dim}— propose, review and archive a change${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    ${c.cyan}csda change${c.reset} <new|list|show|status|instructions|validate|archive> [options]\n\n` +
      `  ${c.bold}SUBCOMMANDS${c.reset}\n` +
      `    ${c.green}new <id>${c.reset}       ${c.dim}Scaffold a change folder (proposal, tasks, delta skeleton).${c.reset}\n` +
      `    ${c.green}list${c.reset}           ${c.dim}Active changes with task progress.${c.reset}\n` +
      `    ${c.green}show <id>${c.reset}      ${c.dim}Proposal, deltas and what they touch.${c.reset}\n` +
      `    ${c.green}status [id]${c.reset}    ${c.dim}Which artefact to write next.${c.reset}\n` +
      `    ${c.green}validate [id]${c.reset}  ${c.dim}Check the deltas against the capability specs.${c.reset}\n` +
      `    ${c.green}archive <id>${c.reset}   ${c.dim}Merge deltas into the specs, sync traceability, archive.${c.reset}\n\n` +
      `  ${c.bold}OPTIONS${c.reset}\n` +
      `    ${c.green}--project-dir <path>${c.reset}  ${c.dim}Project root (default: auto-detected).${c.reset}\n` +
      `    ${c.green}--json${c.reset}                ${c.dim}One JSON document on stdout; prose on stderr.${c.reset}\n` +
      `    ${c.green}--capability <name>${c.reset}   ${c.dim}(new) Seed a delta for this capability.${c.reset}\n` +
      `    ${c.green}--full${c.reset}                ${c.dim}(new) Full rigor — also scaffold design.md.${c.reset}\n` +
      `    ${c.green}--reserve <n>${c.reset}         ${c.dim}(new) Reserve n REQ ids for this change (default 3).${c.reset}\n` +
      `    ${c.green}--strict${c.reset}              ${c.dim}(validate) Treat advisory warnings as failures.${c.reset}\n` +
      `    ${c.green}--dry-run${c.reset}             ${c.dim}(archive) Print the plan, write nothing.${c.reset}\n` +
      `    ${c.green}--force${c.reset}               ${c.dim}(archive) Archive with unchecked tasks; overwrite features.${c.reset}\n\n`
  );
}

/** Parsed command-line options for this command. */
export interface ChangeOptions {
  projectDir: string;
  json: boolean;
  strict: boolean;
  dryRun: boolean;
  force: boolean;
  full: boolean;
  capability: string | null;
  schema?: string;
  reserve: number;
  yes?: boolean;
  positional: string[];
}

function parseArgs(argv) {
  const opts: ChangeOptions = {
    projectDir: ".",
    json: false,
    strict: false,
    dryRun: false,
    force: false,
    full: false,
    capability: null,
    reserve: 3,
    positional: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--capability" && argv[i + 1]) opts.capability = argv[++i];
    else if (a === "--schema" && argv[i + 1]) opts.schema = argv[++i];
    else if (a === "--reserve" && argv[i + 1]) opts.reserve = parseInt(argv[++i], 10) || 3;
    else if (a === "--json") opts.json = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--yes" || a === "-y") opts.yes = true;
    else if (a === "--full") opts.full = true;
    else if (a === "--lite") opts.full = false;
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${a}\n`);
      process.exit(2);
    } else opts.positional.push(a);
  }
  return opts;
}

// The contract itself lives in scripts/lib/agent.ts; these are thin adapters
// that keep the existing `opts`-first call sites unchanged.
const fail = (opts, nullShape, diags) => agentIo(opts.json).fail(nullShape, diags);
const emit = (opts, payload, renderHuman) => agentIo(opts.json).emit(payload, renderHuman);

// ── new ───────────────────────────────────────────────────────────────────────

function templateProposal(changeId) {
  return `# Proposal: ${changeId}

## Intent

<!-- Why this change exists. The problem, not the solution. -->

## Scope

In scope:

-

Out of scope:

-

## Approach

<!-- One paragraph. The technical detail belongs in design.md. -->
`;
}

function templateTasks() {
  return `# Tasks

## 1. Specification

- [ ] 1.1 Write the delta spec for each affected capability
- [ ] 1.2 Run \`csda change validate\`

## 2. Implementation

- [ ] 2.1
`;
}

function templateDesign(changeId) {
  return `# Design: ${changeId}

## Technical approach

<!-- How. Only what a reviewer needs to judge the approach. -->

## Decisions

### Decision:

<!-- What was chosen, and what was rejected, and why. -->

## Affected files

-
`;
}

function templateDelta(capability, reqId, projectDir?) {
  // Prose follows the project's language; the grammar never does. SHALL,
  // GIVEN/WHEN/THEN and the section headings are what the validator parses.
  const t = phrases(projectDir);
  return `# Delta — ${capability}

## ADDED Requirements

### Requirement: ${reqId} — ${t.shortName}

${t.systemShall(t.observableBehaviour)}

#### Scenario: ${t.scenarioName}

- GIVEN ${t.precondition}
- WHEN ${t.action}
- THEN ${t.outcome}

<!-- csda:trace uc=UC-000 feature=features/<area>/<name>.feature -->
`;
}

function cmdNew(opts) {
  const projectDir = resolveProjectDir(opts.projectDir);
  const p = paths(projectDir);
  const changeId = opts.positional[0];
  const nullShape = { change: null };

  if (!changeId) {
    return fail(opts, nullShape, [
      error("change_id_required", "`change new` expects a change id.", {
        fix: "e.g. `csda change new add-dynamic-pricing`",
      }),
    ]);
  }
  if (!CHANGE_ID_RE.test(changeId)) {
    return fail(opts, nullShape, [
      error("invalid_change_id", `"${changeId}" is not a valid change id.`, {
        target: changeId,
        fix: "Use lowercase kebab-case, e.g. add-dynamic-pricing.",
      }),
    ]);
  }
  const dir = p.change(changeId);
  if (fs.existsSync(dir)) {
    return fail(opts, nullShape, [
      error("change_exists", `Change "${changeId}" already exists.`, {
        target: changeId,
        fix: `Edit ${path.relative(projectDir, dir)}, or pick another id.`,
      }),
    ]);
  }

  const reqRange = reserveReqRange(projectDir, opts.reserve);
  const config = {
    ...DEFAULT_CONFIG,
    schema: opts.schema || DEFAULT_CONFIG.schema,
    created: new Date().toISOString().slice(0, 10),
    rigor: opts.full ? "full" : "lite",
    req_range: reqRange,
  };

  const created = [];
  const write = (file, contents) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents, "utf8");
    created.push(path.relative(projectDir, file).split(path.sep).join("/"));
  };

  write(path.join(dir, CHANGE_CONFIG_FILE), renderConfig(config));
  write(path.join(dir, "proposal.md"), templateProposal(changeId));
  write(path.join(dir, "tasks.md"), templateTasks());
  if (opts.full) write(path.join(dir, "design.md"), templateDesign(changeId));
  if (opts.capability) {
    write(
      path.join(p.changeSpecs(changeId), opts.capability, "spec.md"),
      templateDelta(opts.capability, reqRange[0])
    );
  }

  emit(
    opts,
    {
      change: {
        id: changeId,
        path: path.relative(projectDir, dir).split(path.sep).join("/"),
        schema: config.schema,
        rigor: config.rigor,
        reqRange,
        created,
      },
    },
    () => {
      process.stdout.write(
        `\n  ${c.green}✔${c.reset} Change ${c.bold}${changeId}${c.reset} created ` +
          `${c.dim}(${config.rigor} · REQ ids ${reqRange[0]}…${reqRange[1]} reserved)${c.reset}\n\n` +
          created.map((f) => `    ${c.dim}+${c.reset} ${f}\n`).join("") +
          `\n  ${c.dim}Next:${c.reset} write the proposal, then the delta, then ` +
          `${c.cyan}csda change validate ${changeId}${c.reset}\n\n`
      );
    }
  );
}

// ── list ──────────────────────────────────────────────────────────────────────

function cmdList(opts) {
  const projectDir = resolveProjectDir(opts.projectDir);
  const ids = listChangeIds(projectDir);
  const changes = ids.map((id) => {
    const progress = taskProgress(projectDir, id);
    const config = readConfig(projectDir, id);
    return {
      id,
      schema: config.schema,
      rigor: config.rigor,
      completedTasks: progress.complete,
      totalTasks: progress.total,
      deltaCount: listDeltas(projectDir, id).length,
      status: changeStatusLabel(progress),
    };
  });

  emit(opts, { changes, archived: listArchivedIds(projectDir).length }, () => {
    if (changes.length === 0) {
      process.stdout.write(`\n  ${c.dim}No active changes.${c.reset}\n\n`);
      return;
    }
    process.stdout.write(`\n  ${c.bold}Active changes${c.reset}\n\n`);
    for (const ch of changes) {
      const mark =
        ch.status === "complete"
          ? `${c.green}●${c.reset}`
          : ch.status === "in-progress"
            ? `${c.yellow}◐${c.reset}`
            : `${c.dim}○${c.reset}`;
      process.stdout.write(
        `    ${mark} ${c.bold}${ch.id}${c.reset}  ` +
          `${c.dim}${ch.completedTasks}/${ch.totalTasks} tasks · ${ch.deltaCount} delta(s) · ${ch.rigor}${c.reset}\n`
      );
    }
    process.stdout.write("\n");
  });
}

// ── show ──────────────────────────────────────────────────────────────────────

function cmdShow(opts) {
  const projectDir = resolveProjectDir(opts.projectDir);
  const p = paths(projectDir);
  const changeId = opts.positional[0];
  const nullShape = { change: null };

  if (!changeId || !fs.existsSync(p.change(changeId))) {
    return fail(opts, nullShape, [
      error("change_not_found", `Change "${changeId || "(none)"}" does not exist.`, {
        target: changeId,
        fix: "Run `csda change list`.",
      }),
    ]);
  }

  const deltas = listDeltas(projectDir, changeId).map((entry) => {
    const parsed = parseDelta(fs.readFileSync(entry.file, "utf8"));
    return {
      capability: entry.capability,
      file: entry.relative,
      added: parsed.added.map((r) => r.heading),
      modified: parsed.modified.map((r) => r.heading),
      removed: parsed.removed.map((r) => r.heading),
    };
  });

  const proposalFile = path.join(p.change(changeId), "proposal.md");
  const proposal = fs.existsSync(proposalFile) ? fs.readFileSync(proposalFile, "utf8") : "";
  const titleMatch = /^#\s+(.+)$/m.exec(proposal);
  const progress = taskProgress(projectDir, changeId);

  emit(
    opts,
    {
      change: {
        id: changeId,
        title: titleMatch ? titleMatch[1] : changeId,
        config: readConfig(projectDir, changeId),
        deltaCount: deltas.length,
        deltas,
        tasks: { total: progress.total, complete: progress.complete },
      },
    },
    () => {
      process.stdout.write(`\n  ${c.bold}${titleMatch ? titleMatch[1] : changeId}${c.reset}\n\n`);
      if (deltas.length === 0) {
        process.stdout.write(`    ${c.dim}No delta specs.${c.reset}\n\n`);
      }
      for (const d of deltas) {
        process.stdout.write(
          `    ${c.cyan}${d.capability}${c.reset} ${c.dim}(${d.file})${c.reset}\n`
        );
        for (const r of d.added) process.stdout.write(`      ${c.green}+${c.reset} ${r}\n`);
        for (const r of d.modified) process.stdout.write(`      ${c.yellow}~${c.reset} ${r}\n`);
        for (const r of d.removed) process.stdout.write(`      ${c.red}-${c.reset} ${r}\n`);
      }
      process.stdout.write(
        `\n    ${c.dim}${progress.complete}/${progress.total} tasks complete${c.reset}\n\n`
      );
    }
  );
}

// ── status ────────────────────────────────────────────────────────────────────

function cmdStatus(opts) {
  const projectDir = resolveProjectDir(opts.projectDir);
  const ids = listChangeIds(projectDir);
  const changeId = opts.positional[0] || (ids.length === 1 ? ids[0] : null);

  if (!changeId) {
    const payload = {
      changes: ids,
      message:
        ids.length === 0 ? "No active changes." : "Several active changes — name the one you mean.",
    };
    return emit(opts, payload, () => {
      process.stdout.write(`\n  ${c.dim}${payload.message}${c.reset}\n\n`);
    });
  }

  const p = paths(projectDir);
  if (!fs.existsSync(p.change(changeId))) {
    return fail(opts, { changeName: null, artifacts: [] }, [
      error("change_not_found", `Change "${changeId}" does not exist.`, {
        target: changeId,
        fix: "Run `csda change list`.",
      }),
    ]);
  }

  const config = readConfig(projectDir, changeId);
  const artifacts = artifactState(projectDir, changeId, config);
  const progress = taskProgress(projectDir, changeId);
  const isPlanningComplete = artifacts.every((a) => a.status === "done" || a.status === "skipped");
  const nextSteps = artifacts
    .filter((a) => a.status === "ready")
    .map((a) => `Write ${a.outputPath}`);
  if (isPlanningComplete && progress.remaining > 0) {
    nextSteps.push(`Work through tasks.md (${progress.remaining} remaining)`);
  }
  if (isPlanningComplete && progress.remaining === 0) {
    nextSteps.push(`Archive with \`csda change archive ${changeId}\``);
  }

  emit(
    opts,
    {
      changeName: changeId,
      schemaName: config.schema,
      artifacts,
      tasks: { total: progress.total, complete: progress.complete, remaining: progress.remaining },
      isPlanningComplete,
      nextSteps,
    },
    () => {
      process.stdout.write(
        `\n  ${c.bold}${changeId}${c.reset} ${c.dim}(${config.schema})${c.reset}\n\n`
      );
      const mark = {
        done: `${c.green}✔${c.reset}`,
        ready: `${c.yellow}▶${c.reset}`,
        blocked: `${c.dim}·${c.reset}`,
        skipped: `${c.dim}—${c.reset}`,
      };
      for (const a of artifacts) {
        const deps = a.missingDeps ? ` ${c.dim}(needs ${a.missingDeps.join(", ")})${c.reset}` : "";
        process.stdout.write(
          `    ${mark[a.status]} ${a.id.padEnd(10)} ${c.dim}${a.outputPath}${c.reset}${deps}\n`
        );
      }
      process.stdout.write(`\n  ${c.bold}Next${c.reset}\n`);
      for (const step of nextSteps) process.stdout.write(`    ${c.cyan}→${c.reset} ${step}\n`);
      process.stdout.write("\n");
    }
  );
}

// ── validate ──────────────────────────────────────────────────────────────────

export function validateChange(projectDir, changeId, opts) {
  const p = paths(projectDir);
  const diagnostics = [];
  const dir = p.change(changeId);
  const config = readConfig(projectDir, changeId);

  if (!fs.existsSync(path.join(dir, "proposal.md"))) {
    diagnostics.push(
      error("missing_proposal", `Change "${changeId}" has no proposal.md.`, {
        target: changeId,
        fix: `Create ${path.join("docs/specs/changes", changeId, "proposal.md")}.`,
      })
    );
  }

  const deltas = listDeltas(projectDir, changeId);
  if (deltas.length === 0 && !config.skip_specs) {
    diagnostics.push(
      warning("no_deltas", `Change "${changeId}" carries no delta specs.`, {
        target: changeId,
        fix: "Add a delta under specs/<capability>/spec.md, or set skip_specs: true.",
      })
    );
  }

  for (const entry of deltas) {
    const specFile = p.capabilitySpec(entry.capability);
    const specSource = fs.existsSync(specFile) ? fs.readFileSync(specFile, "utf8") : null;
    const { diagnostics: d } = validateDelta(fs.readFileSync(entry.file, "utf8"), {
      specSource,
      file: entry.relative,
      strict: opts.strict,
    });
    diagnostics.push(...d);
  }

  return { changeId, deltaCount: deltas.length, diagnostics };
}

function cmdValidate(opts) {
  const projectDir = resolveProjectDir(opts.projectDir);
  const requested = opts.positional[0];
  const ids = requested ? [requested] : listChangeIds(projectDir);
  const p = paths(projectDir);

  if (requested && !fs.existsSync(p.change(requested))) {
    return fail(opts, { items: [] }, [
      error("change_not_found", `Change "${requested}" does not exist.`, {
        target: requested,
        fix: "Run `csda change list`.",
      }),
    ]);
  }

  const items = ids.map((id) => {
    const result = validateChange(projectDir, id, opts);
    const failed = opts.strict ? result.diagnostics.length > 0 : hasErrors(result.diagnostics);
    return {
      id,
      type: "change",
      valid: !failed,
      deltaCount: result.deltaCount,
      issues: result.diagnostics,
    };
  });

  const failedCount = items.filter((i) => !i.valid).length;
  const payload = {
    items,
    summary: { total: items.length, passed: items.length - failedCount, failed: failedCount },
    version: "1.0",
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ ...payload, status: [] }, null, 2)}\n`);
  } else if (items.length === 0) {
    process.stdout.write(`\n  ${c.dim}No active changes to validate.${c.reset}\n\n`);
  } else {
    process.stdout.write("\n");
    for (const item of items) {
      const mark = item.valid ? `${c.green}✔${c.reset}` : `${c.red}✖${c.reset}`;
      process.stdout.write(
        `  ${mark} ${c.bold}${item.id}${c.reset} ${c.dim}(${item.deltaCount} delta(s))${c.reset}\n`
      );
      if (item.issues.length > 0) {
        printDiagnostics(item.issues, process.stdout);
      }
    }
    process.stdout.write("\n");
  }

  process.exit(failedCount > 0 ? 1 : 0);
}

// ── archive ───────────────────────────────────────────────────────────────────

function cmdArchive(opts) {
  const projectDir = resolveProjectDir(opts.projectDir);
  const changeId = opts.positional[0];
  const nullShape = { archive: null };

  if (!changeId) {
    return fail(opts, nullShape, [
      error("archive_change_name_required", "`change archive` expects a change id.", {
        fix: "e.g. `csda change archive add-dynamic-pricing`",
      }),
    ]);
  }

  const plan = planArchive(projectDir, changeId, { force: opts.force });

  if (!plan.ok) {
    return fail(opts, nullShape, plan.diagnostics);
  }

  const rel = (f) => path.relative(projectDir, f).split(path.sep).join("/");
  const summary = {
    change: changeId,
    archivedAs: plan.archivedAs,
    specsUpdated: plan.specsUpdated,
    totals: plan.totals,
    writes: plan.writes.map((w) => ({ file: rel(w.file), kind: w.kind })),
    deletes: plan.deletes.map((d) => ({ file: rel(d.file), reason: d.reason })),
    warnings: plan.warnings,
  };

  if (opts.dryRun) {
    return emit(opts, { archive: { ...summary, dryRun: true } }, () => {
      process.stdout.write(
        `\n  ${c.bold}Archive plan${c.reset} ${c.dim}(dry run — nothing written)${c.reset}\n\n`
      );
      for (const w of summary.writes) {
        process.stdout.write(`    ${c.green}~${c.reset} ${w.file} ${c.dim}(${w.kind})${c.reset}\n`);
      }
      for (const d of summary.deletes) {
        process.stdout.write(`    ${c.red}-${c.reset} ${d.file} ${c.dim}(${d.reason})${c.reset}\n`);
      }
      process.stdout.write(
        `    ${c.cyan}→${c.reset} ${rel(plan.move.from)} ${c.dim}moves to${c.reset} ${rel(plan.move.to)}\n`
      );
      if (plan.warnings.length > 0) {
        process.stdout.write("\n");
        printDiagnostics(plan.warnings, process.stdout);
      }
      process.stdout.write("\n");
    });
  }

  try {
    executeArchive(plan);
  } catch (err) {
    return fail(opts, nullShape, [
      error("archive_spec_update_failed", `Archive failed and was rolled back: ${err.message}`, {
        target: changeId,
        fix: "Fix the underlying filesystem error and re-run; the project is unchanged.",
      }),
    ]);
  }

  emit(opts, { archive: summary }, () => {
    const t = plan.totals;
    process.stdout.write(
      `\n  ${c.green}✔${c.reset} Archived as ${c.bold}${plan.archivedAs}${c.reset}\n\n` +
        `    ${c.dim}specs:${c.reset}        ${t.added} added · ${t.modified} modified · ${t.removed} removed\n` +
        `    ${c.dim}traceability:${c.reset} ${t.traceability.added} row(s) added · ${t.traceability.updated} updated · ${t.traceability.removed} removed\n` +
        `    ${c.dim}features:${c.reset}     ${plan.writes.filter((w) => w.kind === "feature").length} materialised\n\n` +
        `  ${c.dim}Now run${c.reset} ${c.cyan}csda validate . --strict-tdd${c.reset} ${c.dim}— it will fail until the tests exist.${c.reset}\n\n`
    );
    if (plan.warnings.length > 0) printDiagnostics(plan.warnings, process.stdout);
  });
}

// ── entry ─────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (!sub || sub === "--help" || sub === "-h") {
    usage();
    process.exit(sub ? 0 : 2);
  }

  // `instructions` parses its own arguments: its first positional is an
  // artefact name, not a change id, so the shared parser does not fit.
  if (sub === "instructions") {
    instructionsMain(argv.slice(1), TEMPLATES);
    return;
  }

  const opts = parseArgs(argv.slice(1));

  const table = {
    new: cmdNew,
    list: cmdList,
    show: cmdShow,
    status: cmdStatus,
    validate: cmdValidate,
    archive: cmdArchive,
  };

  const handler = table[sub];
  if (!handler) {
    process.stderr.write(
      `Unknown change sub-command: ${sub}. Expected: ${Object.keys(table).join(", ")}\n`
    );
    process.exit(2);
  }

  try {
    handler(opts);
  } catch (err) {
    fail(opts, {}, [
      error("change_error", err.message, {
        fix: "Re-run with --json for the machine-readable form of this failure.",
      }),
    ]);
  }
}

if (require.main === module) main();

export { artifactState, ARTIFACTS };
