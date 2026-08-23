/**
 * `planAttempt` decides which agents run for one attempt. It is the whole of
 * the roles feature that can be wrong without a filesystem, so it is pinned
 * here — including the promise that a project which configures nothing keeps
 * exactly the behaviour it had.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import { planAttempt } from "../../src/domain/HarnessRun";

test("with no configuration every attempt is one plain implementing step", () => {
  for (const attempt of [1, 2, 3]) {
    assert.deepEqual(planAttempt(attempt), [{ profile: null, advisory: false }]);
  }
});

test("the ladder gives each attempt its own profile", () => {
  const opts = { attemptProfiles: ["implementer", "repairer", "repairer-strong"] };
  assert.deepEqual(planAttempt(1, opts), [{ profile: "implementer", advisory: false }]);
  assert.deepEqual(planAttempt(2, opts), [{ profile: "repairer", advisory: false }]);
  assert.deepEqual(planAttempt(3, opts), [{ profile: "repairer-strong", advisory: false }]);
});

test("a ladder shorter than the attempt count reuses its last rung", () => {
  const opts = { attemptProfiles: ["implementer", "repairer"] };
  assert.deepEqual(planAttempt(3, opts), [{ profile: "repairer", advisory: false }]);
  assert.deepEqual(planAttempt(9, opts), [{ profile: "repairer", advisory: false }]);
});

test("the reviewer runs before a retry, never before the first attempt", () => {
  const opts = { attemptProfiles: ["implementer", "repairer"], reviewProfile: "reviewer" };

  assert.deepEqual(
    planAttempt(1, opts),
    [{ profile: "implementer", advisory: false }],
    "there is nothing to review before any work exists"
  );
  assert.deepEqual(planAttempt(2, opts), [
    { profile: "reviewer", advisory: true },
    { profile: "repairer", advisory: false },
  ]);
});

test("a review profile alone still leaves one implementing step", () => {
  const steps = planAttempt(2, { reviewProfile: "reviewer" });
  assert.deepEqual(steps, [
    { profile: "reviewer", advisory: true },
    { profile: null, advisory: false },
  ]);
});

test("exactly one step per attempt is non-advisory", () => {
  // The gate judges one piece of work. Two implementing steps in an attempt
  // would mean two, and the second would silently overwrite the first.
  const opts = { attemptProfiles: ["a", "b", "c"], reviewProfile: "r" };
  for (const attempt of [1, 2, 3]) {
    const steps = planAttempt(attempt, opts);
    assert.equal(steps.filter((s) => !s.advisory).length, 1);
    assert.equal(steps[steps.length - 1].advisory, false, "the implementing step comes last");
  }
});
