/**
 * Reading what Cucumber actually did, instead of reading its prose (F5).
 *
 * ## Why
 *
 * The gate asks one question — did the command exit zero? — and H14 showed what
 * that misses: `1 scenario (1 passed) · 0 steps · exit 0` is a scenario that
 * tested nothing and reported success. `filterHint` already tried to catch a
 * neighbouring problem, a filter that silently did not apply, by running a
 * regular expression over the human summary looking for "16 scenarios". A
 * regex over prose is a guess; this is the same fact, stated by the runner.
 *
 * Cucumber has published a machine-readable channel for years. `--format
 * message` emits NDJSON, one envelope per line, and it answers directly:
 *
 * - is there a scenario for the requirement under test at all;
 * - did it *run*;
 * - did it have steps;
 * - did every one of them end `PASSED`;
 * - how many scenarios ran in total.
 *
 * ## Built against a real stream
 *
 * The shapes here were taken from `npx cucumber-js --format message` over this
 * repository's own suite (protocol 33.0.4, cucumber-js 13.2.1), not from
 * memory. One detail that only shows up that way: `testCase.testSteps` includes
 * **hook** steps, which carry no `pickleStepId`. Counting those as steps would
 * let an empty scenario with a `Before` hook read as having one — precisely the
 * H14 failure, rebuilt in a new place.
 *
 * ## Staying runner-neutral
 *
 * Nothing here is required. A project that does not use Cucumber keeps the
 * exit-code gate, and the harness stays neutral about the runner — this is an
 * extra reading for the runner that offers one.
 */

import type { Diagnostic } from "./Diagnostic";
import { error, warning } from "./Diagnostic";

export const GATE_MESSAGE_CODES = Object.freeze({
  NOT_FOUND: "gate_scenario_not_found",
  NOT_EXECUTED: "gate_scenario_not_executed",
  NO_STEPS: "gate_scenario_has_no_steps",
  NOT_PASSED: "gate_scenario_not_passed",
  RAN_MORE_THAN_ASKED: "gate_ran_more_than_asked",
});

export interface PickleOutcome {
  readonly id: string;
  readonly uri: string;
  readonly name: string;
  readonly tags: readonly string[];
  /** Steps the *scenario* declares. Hook steps are not steps. */
  readonly stepCount: number;
  readonly executed: boolean;
  /** One status per executed pickle step, in order. */
  readonly stepStatuses: readonly string[];
  /** `PASSED` only when it ran, had steps, and every one of them passed. */
  readonly status: string;
}

export interface CucumberRun {
  readonly pickles: readonly PickleOutcome[];
  /** Scenarios the runner actually started. The number `filterHint` guessed at. */
  readonly executed: number;
  readonly implementation: string | null;
  /** True when the stream carried at least one envelope we understood. */
  readonly parsed: boolean;
}

/** Worse than `PASSED`, in the order a run should be judged by. */
const FAILING_ORDER = ["FAILED", "AMBIGUOUS", "UNDEFINED", "PENDING", "SKIPPED", "UNKNOWN"];

function worstStatus(statuses: readonly string[]): string {
  for (const candidate of FAILING_ORDER) {
    if (statuses.includes(candidate)) return candidate;
  }
  return statuses.length > 0 ? "PASSED" : "NOT_EXECUTED";
}

/**
 * Fold an NDJSON message stream into per-scenario outcomes.
 *
 * Tolerant on purpose: a line that is not JSON, or an envelope of a kind we do
 * not use, is skipped rather than fatal. The stream is written progressively,
 * so a killed run leaves a partial last line, and refusing to read the other
 * 300 envelopes because of it would be the wrong trade.
 */
export function parseCucumberMessages(ndjson: string): CucumberRun {
  const pickles = new Map<string, any>();
  /** testCase id → { pickleId, pickleStepByTestStepId } */
  const testCases = new Map<string, { pickleId: string; steps: Map<string, string> }>();
  /** testCaseStarted id → testCase id */
  const started = new Map<string, string>();
  /** pickle id → status per pickle step */
  const statuses = new Map<string, string[]>();
  let implementation: string | null = null;
  let parsed = false;

  for (const line of (ndjson || "").split("\n")) {
    const text = line.trim();
    if (!text) continue;
    let envelope: any;
    try {
      envelope = JSON.parse(text);
    } catch {
      continue;
    }
    if (!envelope || typeof envelope !== "object") continue;

    if (envelope.meta) {
      parsed = true;
      implementation = envelope.meta?.implementation?.name ?? null;
    } else if (envelope.pickle) {
      parsed = true;
      pickles.set(envelope.pickle.id, envelope.pickle);
    } else if (envelope.testCase) {
      parsed = true;
      const steps = new Map<string, string>();
      for (const step of envelope.testCase.testSteps ?? []) {
        // No `pickleStepId` means a hook, and a hook is not a step the
        // scenario declared. See the module note.
        if (step?.pickleStepId) steps.set(step.id, step.pickleStepId);
      }
      testCases.set(envelope.testCase.id, { pickleId: envelope.testCase.pickleId, steps });
    } else if (envelope.testCaseStarted) {
      parsed = true;
      started.set(envelope.testCaseStarted.id, envelope.testCaseStarted.testCaseId);
    } else if (envelope.testStepFinished) {
      parsed = true;
      const testCaseId = started.get(envelope.testStepFinished.testCaseStartedId);
      const testCase = testCaseId ? testCases.get(testCaseId) : undefined;
      if (!testCase) continue;
      if (!testCase.steps.has(envelope.testStepFinished.testStepId)) continue; // a hook
      const status = envelope.testStepFinished.testStepResult?.status ?? "UNKNOWN";
      const list = statuses.get(testCase.pickleId) ?? [];
      list.push(status);
      statuses.set(testCase.pickleId, list);
    }
  }

  const executedPickleIds = new Set<string>();
  for (const testCaseId of started.values()) {
    const testCase = testCases.get(testCaseId);
    if (testCase) executedPickleIds.add(testCase.pickleId);
  }

  const outcomes: PickleOutcome[] = [...pickles.values()].map((pickle) => {
    const stepStatuses = statuses.get(pickle.id) ?? [];
    const executed = executedPickleIds.has(pickle.id);
    return {
      id: pickle.id,
      uri: pickle.uri ?? "",
      name: pickle.name ?? "",
      tags: (pickle.tags ?? []).map((t: any) => String(t?.name ?? "")),
      stepCount: (pickle.steps ?? []).length,
      executed,
      stepStatuses,
      status: executed ? worstStatus(stepStatuses) : "NOT_EXECUTED",
    };
  });

  return {
    pickles: outcomes,
    executed: executedPickleIds.size,
    implementation,
    parsed,
  };
}

/**
 * Does this command invoke cucumber-js directly, so the harness can ask it for
 * the message stream?
 *
 * Deliberately narrow. `npm test` may well run Cucumber, and the harness has no
 * way to know — appending a flag to it would either be ignored or break the
 * command. Only a direct invocation is rewritten; every other project declares
 * `message_report` in `harness.config.yaml` and keeps control of its own
 * command.
 */
export function invokesCucumberDirectly(command: string): boolean {
  return /(^|\s|\/)cucumber-js(\s|$)/.test(String(command || ""));
}

/** The same command, told to also write its message stream to `file`. */
export function withMessageReport(command: string, file: string): string {
  if (/--format[= ]message/.test(command)) return command;
  return `${command} --format message:${file}`;
}

export interface GateTarget {
  readonly requirement?: string;
  /** `SCN-001`, as the matrix row declares it. */
  readonly scenarioId?: string;
  /** The feature path, already stripped of back-ticks and any `#` fragment. */
  readonly featureFile?: string;
}

/**
 * Which scenarios in the run belong to the requirement under test.
 *
 * Tags first — `@REQ-001` / `@SCN-001` is the direct statement, and F4 is what
 * makes them common. Falling back to the feature path keeps this useful before
 * F4 lands, since a matrix row already names one file per requirement.
 */
export function pickTargetPickles(run: CucumberRun, target: GateTarget): readonly PickleOutcome[] {
  const wanted = [target.requirement, target.scenarioId]
    .filter((t): t is string => Boolean(t))
    .map((t) => `@${t.toLowerCase()}`);

  if (wanted.length > 0) {
    const tagged = run.pickles.filter((p) =>
      p.tags.some((tag) => wanted.includes(tag.toLowerCase()))
    );
    if (tagged.length > 0) return tagged;
  }

  const file = String(target.featureFile ?? "").replace(/\\/g, "/");
  if (!file) return [];
  return run.pickles.filter((p) => p.uri.replace(/\\/g, "/") === file);
}

/**
 * What the message stream says about the gate's claim.
 *
 * Returns `[]` when the stream carried nothing we understood — a project whose
 * command is not Cucumber must not be failed by a reader that did not apply.
 */
export function checkGateRun(run: CucumberRun, target: GateTarget): Diagnostic[] {
  if (!run.parsed) return [];

  const found: Diagnostic[] = [];
  const label = target.requirement || target.scenarioId || target.featureFile || "the requirement";
  const mine = pickTargetPickles(run, target);

  if (mine.length === 0) {
    found.push(
      error(
        GATE_MESSAGE_CODES.NOT_FOUND,
        `the run contains no scenario for ${label}. The gate reported success for ` +
          `a suite that never covered it.`,
        {
          target: target.requirement,
          fix:
            `Check the filter in the gate command, and that the feature file the ` +
            `matrix declares is the one the runner loads.`,
        }
      )
    );
    return found;
  }

  for (const pickle of mine) {
    if (!pickle.executed) {
      found.push(
        error(
          GATE_MESSAGE_CODES.NOT_EXECUTED,
          `"${pickle.name}" exists but never ran, so nothing about ${label} was verified.`,
          {
            target: target.requirement,
            file: pickle.uri,
            fix: "Check the runner's filter and tags.",
          }
        )
      );
      continue;
    }
    if (pickle.stepCount === 0) {
      found.push(
        error(
          GATE_MESSAGE_CODES.NO_STEPS,
          `"${pickle.name}" ran with no steps, so it passed without testing anything.`,
          {
            target: target.requirement,
            file: pickle.uri,
            fix: "Write Given / When / Then steps — Gherkin keywords are case-sensitive.",
          }
        )
      );
      continue;
    }
    if (pickle.status !== "PASSED") {
      found.push(
        error(
          GATE_MESSAGE_CODES.NOT_PASSED,
          `"${pickle.name}" ended ${pickle.status}, not PASSED.`,
          {
            target: target.requirement,
            file: pickle.uri,
            fix: "Make the scenario pass as written.",
          }
        )
      );
    }
  }

  // What `filterHint` guessed with a regex over prose, as a number the runner
  // reported. A warning: running more than asked is a smell, not proof of a
  // broken gate — a project may deliberately run its whole suite.
  if (run.executed > mine.length) {
    found.push(
      warning(
        GATE_MESSAGE_CODES.RAN_MORE_THAN_ASKED,
        `the gate asked for ${mine.length} scenario(s) and the runner executed ` +
          `${run.executed}. The filter may not be applying.`,
        {
          target: target.requirement,
          fix:
            "A runner config that pins its own paths can override the argument — " +
            "check that config on the base branch, not only on main.",
        }
      )
    );
  }

  return found;
}
