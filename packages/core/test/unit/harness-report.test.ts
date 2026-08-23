/**
 * What the harness has actually done, aggregated (C2).
 *
 * C2 opened with "every run forgets itself". That stopped being true when
 * `E1-04` added the ledger and the two cost numbers, so what is tested here is
 * only what was still missing: where the gate rejects, which requirements burn
 * every attempt, the series over time, and the one metric no amount of recorded
 * data can produce on its own — real failures versus false ones.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { parseFalseFailures, sparkline, summariseRuns } from "../../src/domain/HarnessReport";

const run = (startedAt: string, maxAttempts: number, results: any[]) => ({
  startedAt,
  finishedAt: startedAt,
  maxAttempts,
  results,
});

const req = (requirement: string, result: string, attempts: number, stages: string[]) => ({
  requirement,
  result,
  attempts,
  durationMs: 1000 * attempts,
  attemptLog: stages.map((endedAt, i) => ({ attempt: i + 1, endedAt })),
});

test("an empty ledger summarises to zeroes, not to a crash", () => {
  const s = summariseRuns([]);
  assert.equal(s.runs, 0);
  assert.equal(s.firstAttemptRate, null);
  assert.equal(s.realFailureRate, null);
  assert.deepEqual(s.stages, []);
  assert.deepEqual(s.timeline, []);
});

test("stage counts come from every attempt, not from each requirement's verdict", () => {
  // A requirement that passed on attempt 3 still failed twice, and those two
  // failures are the interesting ones. Counting only final results would report
  // a gate that never rejects anything.
  const s = summariseRuns([
    run("2026-08-22T10:00:00Z", 3, [req("REQ-001", "pass", 3, ["gate", "gate", "pass"])]),
  ]);
  assert.deepEqual(s.stages, [
    { stage: "gate", count: 2 },
    { stage: "pass", count: 1 },
  ]);
});

test("the new stages A1 and A2 introduced are counted and named apart", () => {
  // An attempt rejected for editing the spec is a different problem from one
  // that failed its tests, and lumping them together loses the distinction the
  // write-scope guard exists to make.
  const s = summariseRuns([
    run("2026-08-22T10:00:00Z", 2, [req("REQ-001", "fail", 2, ["write-scope", "artifacts"])]),
  ]);
  const byStage = Object.fromEntries(s.stages.map((x) => [x.stage, x.count]));
  assert.equal(byStage["write-scope"], 1);
  assert.equal(byStage["artifacts"], 1);
});

test("requirements that spent every attempt and delivered nothing are listed", () => {
  const s = summariseRuns([
    run("2026-08-22T10:00:00Z", 3, [
      req("REQ-001", "fail", 3, ["gate", "gate", "gate"]),
      req("REQ-002", "fail", 1, ["agent-error"]),
      req("REQ-003", "pass", 3, ["gate", "gate", "pass"]),
    ]),
  ]);
  assert.deepEqual(
    s.exhausted.map((e) => e.requirement),
    ["REQ-001"],
    "only a failure that used the whole budget counts"
  );
});

test("the ceiling is read from the run it belongs to", () => {
  // `max_attempts` is per run. Reading it from the newest would mis-classify
  // every older run the day somebody changes the flag.
  const s = summariseRuns([
    run("2026-08-22T10:00:00Z", 1, [req("REQ-001", "fail", 1, ["gate"])]),
    run("2026-08-22T11:00:00Z", 5, [req("REQ-002", "fail", 1, ["gate"])]),
  ]);
  assert.deepEqual(
    s.exhausted.map((e) => e.requirement),
    ["REQ-001"]
  );
});

test("the timeline runs oldest first, whatever order the ledger was read in", () => {
  const s = summariseRuns([
    run("2026-08-22T12:00:00Z", 1, [req("REQ-002", "pass", 1, ["pass"])]),
    run("2026-08-22T10:00:00Z", 1, [req("REQ-001", "fail", 1, ["gate"])]),
  ]);
  assert.deepEqual(
    s.timeline.map((p) => p.startedAt),
    ["2026-08-22T10:00:00Z", "2026-08-22T12:00:00Z"]
  );
  assert.deepEqual(s.timeline[0], {
    startedAt: "2026-08-22T10:00:00Z",
    passed: 0,
    failed: 1,
  });
});

test("the real-failure rate stays unknown until a person marks one", () => {
  // The point of the metric. Guessing 100% would be the most flattering
  // possible lie about our own gate, and a number nobody can audit is worse
  // than an honest blank.
  const runs = [run("2026-08-22T10:00:00Z", 1, [req("REQ-001", "fail", 1, ["gate"])])];
  assert.equal(summariseRuns(runs).realFailureRate, null);
  assert.equal(summariseRuns(runs).falseFailures, 0);
});

test("a mark makes the ratio computable", () => {
  const runs = [
    run("2026-08-22T10:00:00Z", 1, [
      req("REQ-001", "fail", 1, ["gate"]),
      req("REQ-002", "fail", 1, ["gate"]),
    ]),
  ];
  const s = summariseRuns(runs, [
    { requirement: "REQ-001", reason: "the gate was wrong", markedAt: "2026-08-22T11:00:00Z" },
  ]);
  assert.equal(s.falseFailures, 1);
  assert.equal(s.realFailureRate, 0.5);
});

test("a mark naming something that never failed does not improve the number", () => {
  // Otherwise a typo flatters the metric, which would make it worse than not
  // having one.
  const runs = [run("2026-08-22T10:00:00Z", 1, [req("REQ-001", "pass", 1, ["pass"])])];
  const s = summariseRuns(runs, [
    { requirement: "REQ-001", reason: "typo", markedAt: "2026-08-22T11:00:00Z" },
  ]);
  assert.equal(s.falseFailures, 0);
  assert.equal(s.realFailureRate, null);
});

test("a mark on a passing requirement does not make the ratio computable either", () => {
  // The sharper version of the case above, and the one a careless filter gets
  // wrong: there *is* a real failure here, and nobody has judged it. Counting
  // the irrelevant mark as "somebody looked" would publish 100% real failures
  // on the strength of a typo about a different requirement.
  const runs = [
    run("2026-08-22T10:00:00Z", 1, [
      req("REQ-001", "fail", 1, ["gate"]),
      req("REQ-002", "pass", 1, ["pass"]),
    ]),
  ];
  const s = summariseRuns(runs, [
    { requirement: "REQ-002", reason: "typo — this one passed", markedAt: "t" },
  ]);
  assert.equal(s.falseFailures, 0);
  assert.equal(s.realFailureRate, null, "nobody has judged the failure that actually happened");
});

test("a half-written line does not hide the marks around it", () => {
  // Append-only, so a killed process leaves exactly that.
  const marks = parseFalseFailures(
    [
      '{"requirement":"REQ-001","reason":"a","markedAt":"t"}',
      '{"requirement":"REQ-0',
      '{"requirement":"REQ-002","reason":"b","markedAt":"t"}',
      "",
    ].join("\n")
  );
  assert.deepEqual(
    marks.map((m) => m.requirement),
    ["REQ-001", "REQ-002"]
  );
});

test("the sparkline is as long as the series and empty when there is none", () => {
  assert.equal(sparkline([]), "");
  const points = [
    { startedAt: "a", passed: 1, failed: 0 },
    { startedAt: "b", passed: 0, failed: 0 },
    { startedAt: "c", passed: 4, failed: 0 },
  ];
  const line = sparkline(points);
  assert.equal([...line].length, 3);
  assert.equal([...line][1], "▁", "a run with nothing in it should read as the floor");
});
