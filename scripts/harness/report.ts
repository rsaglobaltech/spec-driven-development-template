#!/usr/bin/env node

/**
 * `csda harness report` — what the harness has actually cost.
 *
 * Two numbers decide whether agent roles, retries and parallelism are worth
 * paying for, and neither was measurable before the run ledger existed:
 *
 *   **cost per delivered requirement** — wall-clock, because an agent is any
 *   shell command and only the agent knows what it spent in tokens; and
 *   **first-attempt success rate** — the one that says whether a retry ladder
 *   is buying anything or just spending three times as much on the same
 *   mistake.
 *
 * Reads `.harness/runs/*.json`, which `harness run` writes. No network, no
 * git, no agent: this command only ever reads.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { resolveProjectDir } from "../lib/project-root";
import { agentIo, wantsJson, EXIT } from "../lib/agent";
import { error } from "../lib/diagnostics";
import { RUNS_DIR } from "./run";

const COLOR =
  process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
const c = {
  reset: COLOR ? "\x1b[0m" : "",
  bold: COLOR ? "\x1b[1m" : "",
  dim: COLOR ? "\x1b[2m" : "",
  green: COLOR ? "\x1b[32m" : "",
  yellow: COLOR ? "\x1b[33m" : "",
};

/** Parsed command-line options for this command. */
export interface HarnessReportOptions {
  projectDir: string;
  json: boolean;
  last: number | null;
}

interface ResultRow {
  requirement: string;
  result: string;
  attempts: number;
  durationMs?: number;
}

interface RunFile {
  startedAt: string;
  finishedAt?: string;
  concurrency?: number;
  results?: ResultRow[];
}

/** Everything the report says, in the shape `--json` emits. */
export interface HarnessReportSummary {
  runs: number;
  requirementsAttempted: number;
  passed: number;
  failed: number;
  blocked: number;
  /** Of the ones that passed, how many did so on attempt 1. */
  firstAttemptPasses: number;
  firstAttemptRate: number | null;
  /** Wall-clock across every attempt, including the ones that failed. */
  totalMs: number;
  /** …divided by the requirements that actually landed. The cost of delivery. */
  msPerDelivered: number | null;
  worst: Array<{ requirement: string; durationMs: number; attempts: number; result: string }>;
}

function usage(): void {
  process.stdout.write(
    `\n  ${c.bold}📈 harness report${c.reset}  ${c.dim}— what the harness has cost${c.reset}\n\n` +
      `  ${c.bold}USAGE${c.reset}\n` +
      `    csda harness report [--project-dir <path>] [--last <n>] [--json]\n\n` +
      `  ${c.bold}OPTIONS${c.reset}\n` +
      `    --last <n>            Only the n most recent runs.\n` +
      `    --json                Machine-readable summary.\n\n`
  );
}

export function parseArgs(argv: string[]): HarnessReportOptions {
  const opts: HarnessReportOptions = { projectDir: ".", json: wantsJson(argv), last: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--project-dir" && argv[i + 1]) opts.projectDir = argv[++i];
    else if (a === "--last" && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error("--last must be a positive integer");
      opts.last = n;
    } else if (a === "--json" || a === "--format") {
      if (a === "--format") i += 1;
    } else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return opts;
}

/** Read the ledger, newest first, skipping anything that is not a run record. */
export function readRuns(projectDir: string, last: number | null): RunFile[] {
  const dir = path.join(projectDir, RUNS_DIR);
  if (!fs.existsSync(dir)) return [];

  const runs: RunFile[] = [];
  for (const name of fs.readdirSync(dir).sort().reverse()) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      if (parsed && Array.isArray(parsed.results)) runs.push(parsed);
    } catch {
      // A half-written record is not worth failing a read-only report over.
    }
    if (last !== null && runs.length >= last) break;
  }
  return runs;
}

export function summarise(runs: RunFile[]): HarnessReportSummary {
  const rows = runs.flatMap((r) => r.results ?? []);
  const passed = rows.filter((r) => r.result === "pass");
  const totalMs = rows.reduce((n, r) => n + (r.durationMs ?? 0), 0);
  const firstAttemptPasses = passed.filter((r) => r.attempts === 1).length;

  const worst = [...rows]
    .filter((r) => (r.durationMs ?? 0) > 0)
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, 5)
    .map((r) => ({
      requirement: r.requirement,
      durationMs: r.durationMs ?? 0,
      attempts: r.attempts,
      result: r.result,
    }));

  return {
    runs: runs.length,
    requirementsAttempted: rows.length,
    passed: passed.length,
    failed: rows.filter((r) => r.result === "fail").length,
    blocked: rows.filter((r) => r.result === "blocked").length,
    firstAttemptPasses,
    firstAttemptRate: passed.length > 0 ? firstAttemptPasses / passed.length : null,
    totalMs,
    msPerDelivered: passed.length > 0 ? Math.round(totalMs / passed.length) : null,
    worst,
  };
}

function human(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function render(summary: HarnessReportSummary): void {
  const label = (text: string) => text.padEnd(26);
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  process.stdout.write(
    `\n  ${c.bold}📈 harness report${c.reset}  ${c.dim}(${summary.runs} run(s))${c.reset}\n\n` +
      `    ${label("requirements attempted")}${summary.requirementsAttempted}\n` +
      `    ${c.green}${label("passed")}${c.reset}${summary.passed}\n` +
      `    ${label("failed")}${summary.failed}\n` +
      `    ${label("blocked")}${summary.blocked}\n\n` +
      `    ${c.bold}${label("first attempt worked")}${c.reset}${pct(summary.firstAttemptRate)}` +
      `  ${c.dim}(${summary.firstAttemptPasses} of ${summary.passed} passes)${c.reset}\n` +
      `    ${c.bold}${label("cost per delivered REQ")}${c.reset}` +
      `${summary.msPerDelivered === null ? "—" : human(summary.msPerDelivered)}` +
      `  ${c.dim}wall-clock, failed attempts included${c.reset}\n`
  );

  if (summary.worst.length > 0) {
    process.stdout.write(`\n  ${c.dim}slowest${c.reset}\n`);
    for (const r of summary.worst) {
      const mark = r.result === "pass" ? c.green : c.yellow;
      process.stdout.write(
        `    ${mark}${r.requirement.padEnd(10)}${c.reset} ${human(r.durationMs).padStart(8)}` +
          `  ${c.dim}${r.attempts} attempt(s), ${r.result}${c.reset}\n`
      );
    }
  }
  process.stdout.write("\n");
}

export function main(argv: string[]): void {
  let opts: HarnessReportOptions;
  const io = agentIo(wantsJson(argv));
  try {
    opts = parseArgs(argv);
  } catch (err) {
    io.usage({ report: null }, [
      error("usage", err instanceof Error ? err.message : String(err), {
        fix: "See `csda harness report --help`.",
      }),
    ]);
    return;
  }

  let projectDir: string;
  try {
    projectDir = resolveProjectDir(opts.projectDir, { requireSentinel: true });
  } catch (err) {
    io.fail({ report: null }, [
      error("no_project", err instanceof Error ? err.message : String(err), {
        fix: "Run from inside a spec-driven project, or pass --project-dir.",
      }),
    ]);
    return;
  }

  const runs = readRuns(projectDir, opts.last);
  if (runs.length === 0) {
    io.emit({ report: summarise([]), status: [] }, () => {
      process.stdout.write(
        `\n  ${c.dim}No runs recorded yet. \`csda harness run\` writes one per run.${c.reset}\n\n`
      );
    });
    process.exit(EXIT.OK);
  }

  const summary = summarise(runs);
  io.emit({ report: summary, status: [] }, () => render(summary));
  process.exit(EXIT.OK);
}

if (require.main === module) main(process.argv.slice(2));
