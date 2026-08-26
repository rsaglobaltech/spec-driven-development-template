/**
 * H19 — the harness gate approved an agent that wrote nothing.
 *
 * Reproduced end to end on 2026-08-26 (`--agent "cat {prompt_file} >
 * /dev/null"` against a generated project reported `pass (1 attempt)` and
 * moved the row to `Implemented`). These tests pin the decidable core of the
 * fix so it cannot regress without failing here first.
 */
import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  agentAuthoredPaths,
  isEmptyAttempt,
  PROMPT_ARCHIVE_DIR,
} from "../../src/domain/EmptyAttempt";

test("an attempt that touched nothing is empty", () => {
  assert.equal(isEmptyAttempt([]), true);
});

test("an attempt carrying only the archived prompt is empty", () => {
  // This is the H19 shape: the harness wrote the archive, the agent wrote
  // nothing. Counting it would let the harness's bookkeeping vouch for the
  // agent.
  assert.equal(isEmptyAttempt([`${PROMPT_ARCHIVE_DIR}/REQ-000-attempt-1-agent.md`]), true);
  assert.equal(isEmptyAttempt([PROMPT_ARCHIVE_DIR]), true);
});

test("one file the agent wrote is enough to not be empty", () => {
  assert.equal(isEmptyAttempt(["src/health.ts"]), false);
});

test("the archived prompt does not hide a real file beside it", () => {
  assert.equal(
    isEmptyAttempt([`${PROMPT_ARCHIVE_DIR}/REQ-000-attempt-1-agent.md`, "src/health.ts"]),
    false
  );
});

test("a path merely starting with the archive's name is not the archive", () => {
  // `.specops/harness-prompts-notes.md` is a different file; a naive
  // startsWith on the bare directory name would swallow it.
  assert.equal(isEmptyAttempt([`${PROMPT_ARCHIVE_DIR}-notes.md`]), false);
});

test("agentAuthoredPaths reports what the agent wrote, in order", () => {
  assert.deepEqual(
    agentAuthoredPaths([
      "src/health.ts",
      `${PROMPT_ARCHIVE_DIR}/REQ-000-attempt-1-agent.md`,
      "tests/health.test.ts",
    ]),
    ["src/health.ts", "tests/health.test.ts"]
  );
});

test("undefined and null touched lists do not throw", () => {
  assert.equal(isEmptyAttempt(undefined as never), true);
  assert.deepEqual(agentAuthoredPaths(null as never), []);
});
