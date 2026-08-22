/**
 * The run ledger and what it is read for.
 *
 * The two numbers here are the ones that decide whether agent roles and retry
 * ladders are worth paying for (E2-01), so the arithmetic is worth pinning:
 * a delivered requirement carries the cost of the attempts that failed on the
 * way, and "first attempt worked" is measured against passes, not against
 * everything tried.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const { summarise, readRuns, parseArgs } = require("../../scripts/harness/report");
const { RUNS_DIR } = require("../../scripts/harness/run");

function run(results: unknown[], startedAt = "2026-08-20T10-00-00-000Z") {
  return { startedAt, finishedAt: startedAt, results };
}

const pass = (requirement: string, attempts = 1, durationMs = 1000) => ({
  requirement,
  result: "pass",
  attempts,
  durationMs,
});

test("an empty ledger summarises to zeroes, not to a crash", () => {
  const s = summarise([]);
  assert.equal(s.runs, 0);
  assert.equal(s.firstAttemptRate, null, "no passes means no rate, not 0%");
  assert.equal(s.msPerDelivered, null);
});

test("the first-attempt rate is measured against passes, not attempts", () => {
  const s = summarise([
    run([
      pass("REQ-001", 1),
      pass("REQ-002", 3),
      { requirement: "REQ-003", result: "fail", attempts: 3, durationMs: 5000 },
    ]),
  ]);
  assert.equal(s.passed, 2);
  assert.equal(s.firstAttemptPasses, 1);
  assert.equal(s.firstAttemptRate, 0.5, "one of the two passes worked first time");
});

test("a delivered requirement carries the cost of the failures around it", () => {
  // The honest number: a run that burned 9s failing and 1s succeeding cost 10s
  // for the one requirement it delivered.
  const s = summarise([
    run([
      pass("REQ-001", 1, 1000),
      { requirement: "REQ-002", result: "fail", attempts: 3, durationMs: 9000 },
    ]),
  ]);
  assert.equal(s.totalMs, 10_000);
  assert.equal(s.msPerDelivered, 10_000);
});

test("blocked requirements are counted but cost nothing", () => {
  const s = summarise([
    run([
      pass("REQ-001"),
      { requirement: "REQ-002", result: "blocked", attempts: 0, durationMs: 0 },
    ]),
  ]);
  assert.equal(s.blocked, 1);
  assert.equal(s.requirementsAttempted, 2);
  assert.equal(s.totalMs, 1000, "a requirement never attempted adds no time");
});

test("the slowest list is ordered and capped", () => {
  const s = summarise([
    run(Array.from({ length: 8 }, (_, i) => pass(`REQ-00${i}`, 1, (i + 1) * 100))),
  ]);
  assert.equal(s.worst.length, 5);
  assert.equal(s.worst[0].durationMs, 800);
  assert.ok(s.worst[0].durationMs >= s.worst[4].durationMs);
});

test("readRuns takes the newest first and honours --last", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csda-ledger-"));
  try {
    const runsDir = path.join(dir, RUNS_DIR);
    fs.mkdirSync(runsDir, { recursive: true });
    for (const stamp of ["2026-01-01", "2026-02-01", "2026-03-01"]) {
      fs.writeFileSync(
        path.join(runsDir, `${stamp}.json`),
        JSON.stringify({ startedAt: stamp, results: [pass("REQ-001")] }),
        "utf8"
      );
    }
    assert.deepEqual(
      readRuns(dir, null).map((r: any) => r.startedAt),
      ["2026-03-01", "2026-02-01", "2026-01-01"]
    );
    assert.deepEqual(
      readRuns(dir, 2).map((r: any) => r.startedAt),
      ["2026-03-01", "2026-02-01"]
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a half-written record does not take the report down", () => {
  // The ledger is written by a process that can be killed mid-write. A
  // read-only report has no business failing over that.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csda-ledger-"));
  try {
    const runsDir = path.join(dir, RUNS_DIR);
    fs.mkdirSync(runsDir, { recursive: true });
    fs.writeFileSync(path.join(runsDir, "broken.json"), '{"startedAt": "x", "resu', "utf8");
    fs.writeFileSync(
      path.join(runsDir, "good.json"),
      JSON.stringify({ startedAt: "y", results: [pass("REQ-001")] }),
      "utf8"
    );
    assert.equal(readRuns(dir, null).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a project with no ledger reads as empty, not as an error", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csda-ledger-"));
  try {
    assert.deepEqual(readRuns(dir, null), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--last refuses a value that is not a positive integer", () => {
  assert.throws(() => parseArgs(["--last", "0"]), /--last must be a positive integer/);
  assert.throws(() => parseArgs(["--last", "x"]), /--last must be a positive integer/);
  assert.equal(parseArgs(["--last", "3"]).last, 3);
});

// ── The mark a person leaves (C2) ────────────────────────────────────────────
//
// A gate that rejects good work and a gate catching a genuine defect look
// identical in the ledger. No amount of recorded data separates them; only
// somebody who looked can say. That is why this is a command and not a
// derivation, and why the ratio reads `—` until the first mark exists.

const {
  appendFalseFailure,
  readFalseFailures,
  FALSE_FAILURES_FILE,
} = require("../../scripts/harness/report");

test("--mark-false-failure demands a reason", () => {
  // A number nobody can audit later is worse than an honest blank. The reason
  // is the whole evidence this metric has.
  assert.throws(() => parseArgs(["--mark-false-failure", "REQ-001"]), /--reason/);
  assert.doesNotThrow(() =>
    parseArgs(["--mark-false-failure", "REQ-001", "--reason", "the gate was wrong"])
  );
});

test("--mark-false-failure refuses anything that is not a REQ id", () => {
  assert.throws(
    () => parseArgs(["--mark-false-failure", "the-login-thing", "--reason", "x"]),
    /REQ-NNN/
  );
});

test("marks round-trip through the append-only file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-marks-"));
  try {
    assert.deepEqual(readFalseFailures(dir), [], "no file means no marks, not an error");

    appendFalseFailure(dir, { requirement: "REQ-001", reason: "flaky test", markedAt: "t1" });
    appendFalseFailure(dir, { requirement: "REQ-002", reason: "bad row", markedAt: "t2" });

    const marks = readFalseFailures(dir);
    assert.deepEqual(
      marks.map((m) => m.requirement),
      ["REQ-001", "REQ-002"],
      "appending must not overwrite what came before"
    );
    assert.equal(marks[0].reason, "flaky test");

    // One JSON object per line, because that is what survives a killed process.
    const raw = fs.readFileSync(path.join(dir, ...FALSE_FAILURES_FILE.split("/")), "utf8");
    assert.equal(raw.trim().split("\n").length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the summary reads the marks the command writes", () => {
  // The seam between the two halves: a mark written by the command has to be
  // the same shape the aggregation reads, or the ratio silently stays blank.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-marks-seam-"));
  try {
    appendFalseFailure(dir, {
      requirement: "REQ-001",
      reason: "the gate was wrong",
      markedAt: "t",
    });
    const runs = [
      {
        startedAt: "2026-08-22T10:00:00Z",
        maxAttempts: 1,
        results: [
          { requirement: "REQ-001", result: "fail", attempts: 1, durationMs: 10, attemptLog: [] },
          { requirement: "REQ-002", result: "fail", attempts: 1, durationMs: 10, attemptLog: [] },
        ],
      },
    ];
    const summary = summarise(runs, readFalseFailures(dir));
    assert.equal(summary.falseFailures, 1);
    assert.equal(summary.realFailureRate, 0.5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
