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
