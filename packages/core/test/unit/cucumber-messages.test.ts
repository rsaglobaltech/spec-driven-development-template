/**
 * Reading what Cucumber did, instead of reading its prose (F5).
 *
 * The gate asked one question — did the command exit zero? — and both silent
 * holes this repository found live underneath it:
 *
 *   §2.1  a scenario with no steps: `1 scenario (1 passed) · 0 steps · exit 0`
 *   §2.2  a filter that matches nothing: `0 scenarios · exit 0`
 *
 * Measured before writing the check: a harness run whose test command was
 * `cucumber-js --tags '@does-not-exist'` reported **1 passed**, published the
 * branch and closed the requirement. With the message stream read, the same run
 * fails and names the scenario that never ran.
 *
 * The envelope shapes come from a real `--format message` stream over this
 * repository's own suite (protocol 33.0.4, cucumber-js 13.2.1), not from
 * memory.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import {
  GATE_MESSAGE_CODES,
  checkGateRun,
  invokesCucumberDirectly,
  parseCucumberMessages,
  pickTargetPickles,
  withMessageReport,
} from "../../src/domain/CucumberMessages";

/** Build an NDJSON stream in the shapes cucumber-js really emits. */
function stream(opts: {
  pickles: Array<{ id: string; uri: string; name: string; tags?: string[]; steps: number }>;
  runs: Array<{ pickleId: string; statuses: string[]; hookStatus?: string }>;
}) {
  const lines: any[] = [{ meta: { implementation: { name: "cucumber-js", version: "13.2.1" } } }];
  for (const p of opts.pickles) {
    lines.push({
      pickle: {
        id: p.id,
        uri: p.uri,
        name: p.name,
        tags: (p.tags ?? []).map((name) => ({ name })),
        steps: Array.from({ length: p.steps }, (_, i) => ({ id: `${p.id}-s${i}` })),
      },
    });
  }
  for (const [n, r] of opts.runs.entries()) {
    const pickle = opts.pickles.find((p) => p.id === r.pickleId)!;
    const testCaseId = `tc-${n}`;
    const startedId = `tcs-${n}`;
    const testSteps: any[] = [];
    // A hook step carries no pickleStepId. Cucumber emits these, and counting
    // them as steps would let an empty scenario read as having one.
    if (r.hookStatus) testSteps.push({ id: `${testCaseId}-hook` });
    for (let i = 0; i < pickle.steps; i += 1) {
      testSteps.push({ id: `${testCaseId}-s${i}`, pickleStepId: `${pickle.id}-s${i}` });
    }
    lines.push({ testCase: { id: testCaseId, pickleId: r.pickleId, testSteps } });
    lines.push({ testCaseStarted: { id: startedId, testCaseId } });
    if (r.hookStatus) {
      lines.push({
        testStepFinished: {
          testCaseStartedId: startedId,
          testStepId: `${testCaseId}-hook`,
          testStepResult: { status: r.hookStatus },
        },
      });
    }
    for (const [i, status] of r.statuses.entries()) {
      lines.push({
        testStepFinished: {
          testCaseStartedId: startedId,
          testStepId: `${testCaseId}-s${i}`,
          testStepResult: { status },
        },
      });
    }
    lines.push({ testCaseFinished: { testCaseStartedId: startedId } });
  }
  return lines.map((l) => JSON.stringify(l)).join("\n");
}

const HEALTH = {
  id: "p1",
  uri: "features/core/health.feature",
  name: "API reports service as healthy",
  tags: ["@REQ-000"],
  steps: 3,
};

test("a clean run reads as passed, with the scenarios it ran counted", () => {
  const run = parseCucumberMessages(
    stream({
      pickles: [HEALTH],
      runs: [{ pickleId: "p1", statuses: ["PASSED", "PASSED", "PASSED"] }],
    })
  );
  assert.equal(run.parsed, true);
  assert.equal(run.implementation, "cucumber-js");
  assert.equal(run.executed, 1);
  assert.equal(run.pickles[0].status, "PASSED");
  assert.deepEqual(checkGateRun(run, { requirement: "REQ-000" }), []);
});

test("a filter that matched nothing is caught — §2.2, exit 0 and no scenarios", () => {
  // Measured: this exact case reported `1 passed` before the stream was read.
  const run = parseCucumberMessages(stream({ pickles: [HEALTH], runs: [] }));
  const found = checkGateRun(run, {
    requirement: "REQ-000",
    featureFile: "features/core/health.feature",
  });
  assert.equal(found[0].code, GATE_MESSAGE_CODES.NOT_EXECUTED);
  assert.match(found[0].message, /never ran/);
});

test("a suite that never loaded the feature at all is caught too", () => {
  const other = { id: "p2", uri: "features/other.feature", name: "Something else", steps: 2 };
  const run = parseCucumberMessages(
    stream({ pickles: [other], runs: [{ pickleId: "p2", statuses: ["PASSED", "PASSED"] }] })
  );
  const found = checkGateRun(run, {
    requirement: "REQ-000",
    featureFile: "features/core/health.feature",
  });
  assert.equal(found[0].code, GATE_MESSAGE_CODES.NOT_FOUND);
  assert.match(found[0].message, /never covered it/);
});

test("a scenario that ran with no steps is caught — §2.1, the H14 shape", () => {
  const empty = { ...HEALTH, steps: 0 };
  const run = parseCucumberMessages(
    stream({ pickles: [empty], runs: [{ pickleId: "p1", statuses: [] }] })
  );
  const found = checkGateRun(run, { requirement: "REQ-000" });
  assert.equal(found[0].code, GATE_MESSAGE_CODES.NO_STEPS);
});

test("a hook is not a step, so a hook cannot rescue an empty scenario", () => {
  // The detail that only shows up against a real stream: `testCase.testSteps`
  // includes hooks, which carry no `pickleStepId`. Counting them would rebuild
  // H14 in a new place — an empty scenario with a `Before` reading as covered.
  const empty = { ...HEALTH, steps: 0 };
  const run = parseCucumberMessages(
    stream({ pickles: [empty], runs: [{ pickleId: "p1", statuses: [], hookStatus: "PASSED" }] })
  );
  assert.equal(run.pickles[0].stepCount, 0);
  assert.deepEqual(run.pickles[0].stepStatuses, [], "the hook's result is not a step's");
  assert.equal(checkGateRun(run, { requirement: "REQ-000" })[0].code, GATE_MESSAGE_CODES.NO_STEPS);
});

test("a failing, undefined or pending step is not a pass", () => {
  for (const status of ["FAILED", "UNDEFINED", "PENDING", "AMBIGUOUS"]) {
    const run = parseCucumberMessages(
      stream({
        pickles: [HEALTH],
        runs: [{ pickleId: "p1", statuses: ["PASSED", status, "SKIPPED"] }],
      })
    );
    const found = checkGateRun(run, { requirement: "REQ-000" });
    assert.equal(found[0].code, GATE_MESSAGE_CODES.NOT_PASSED, status);
    assert.match(found[0].message, new RegExp(status));
  }
});

test("running more than asked is a warning with a real number, not a regex guess", () => {
  // What `filterHint` inferred from "16 scenarios" in prose, stated by the
  // runner. A warning: a project may deliberately run its whole suite.
  const other = { id: "p2", uri: "features/other.feature", name: "Something else", steps: 1 };
  const run = parseCucumberMessages(
    stream({
      pickles: [HEALTH, other],
      runs: [
        { pickleId: "p1", statuses: ["PASSED", "PASSED", "PASSED"] },
        { pickleId: "p2", statuses: ["PASSED"] },
      ],
    })
  );
  const found = checkGateRun(run, { requirement: "REQ-000" });
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, "warning");
  assert.match(found[0].message, /asked for 1 scenario\(s\).*executed 2/);
});

test("tags win over the feature path, so F4's tags will just work", () => {
  const tagged = {
    id: "p9",
    uri: "features/elsewhere.feature",
    name: "Tagged",
    tags: ["@REQ-000"],
    steps: 1,
  };
  const run = parseCucumberMessages(
    stream({ pickles: [HEALTH, tagged], runs: [{ pickleId: "p9", statuses: ["PASSED"] }] })
  );
  assert.deepEqual(
    pickTargetPickles(run, {
      requirement: "REQ-000",
      featureFile: "features/core/health.feature",
    }).map((p) => p.id),
    ["p1", "p9"],
    "both carry the tag"
  );
});

test("a stream we did not understand fails nothing", () => {
  // A project whose command is not Cucumber must not be failed by a check that
  // never applied.
  const run = parseCucumberMessages("this is not json\n{}\n");
  assert.equal(run.parsed, false);
  assert.deepEqual(checkGateRun(run, { requirement: "REQ-000" }), []);
});

test("a half-written last line does not lose the envelopes before it", () => {
  // The stream is written progressively, so a killed run leaves exactly that.
  const full = stream({
    pickles: [HEALTH],
    runs: [{ pickleId: "p1", statuses: ["PASSED", "PASSED", "PASSED"] }],
  });
  const truncated = `${full}\n{"testCaseFin`;
  assert.equal(parseCucumberMessages(truncated).executed, 1);
});

test("only a direct cucumber-js invocation is rewritten", () => {
  // `npm test` may well run Cucumber, and there is no way to know from here —
  // appending a flag to it would be ignored at best.
  assert.equal(invokesCucumberDirectly("npx cucumber-js features/x.feature"), true);
  assert.equal(invokesCucumberDirectly("./node_modules/.bin/cucumber-js"), true);
  assert.equal(invokesCucumberDirectly("npm test"), false);
  assert.equal(invokesCucumberDirectly("mvn -B test"), false);
  assert.equal(invokesCucumberDirectly("echo cucumber-jsx"), false);
});

test("a command that already asks for messages is left alone", () => {
  const already = "cucumber-js --format message:out.ndjson";
  assert.equal(withMessageReport(already, "other.ndjson"), already);
  assert.equal(
    withMessageReport("cucumber-js", ".harness/m.ndjson"),
    "cucumber-js --format message:.harness/m.ndjson"
  );
});
