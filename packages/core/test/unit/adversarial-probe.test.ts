"use strict";

/**
 * The adversarial verification step (D3).
 *
 * The reviewer that already exists returns prose. An adversary returns a test,
 * and a test either fails or it does not — one is an argument, the other is
 * evidence.
 *
 * The rule these tests exist to hold is the one the issue names: **the gate
 * stays the only judge.** An adversary can always assert a behaviour the
 * requirement never promised, so a failing probe is a finding and never a
 * verdict.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { shouldProbe, probeFinding, NO_PROBE } = require("../../src/domain/AdversarialProbe");

// ── when it runs ─────────────────────────────────────────────────────────────

test("no profile, no probe", () => {
  assert.equal(shouldProbe({ profile: "", gatePassed: true, alreadyProbed: false }), false);
  assert.equal(shouldProbe({ profile: null, gatePassed: true, alreadyProbed: false }), false);
});

test("a red gate is not probed", () => {
  // Probing an implementation that already failed tells you nothing you did
  // not know, and costs an agent invocation to learn it.
  assert.equal(
    shouldProbe({ profile: "adversary", gatePassed: false, alreadyProbed: false }),
    false
  );
});

test("once per requirement, not once per attempt", () => {
  // The probe is pure insurance; running it on every retry multiplies the cost
  // of the one step in the loop that buys no progress.
  assert.equal(shouldProbe({ profile: "adversary", gatePassed: true, alreadyProbed: true }), false);
});

test("configured, green, not yet probed — it runs", () => {
  assert.equal(shouldProbe({ profile: "adversary", gatePassed: true, alreadyProbed: false }), true);
});

// ── what a failure produces ──────────────────────────────────────────────────

test("a failing probe is a warning, never an error", () => {
  // Severity is the whole argument. An error would let the adversary fail a
  // requirement it may simply have misunderstood.
  const finding = probeFinding("REQ-007", {
    ran: true,
    broke: true,
    detail: "expected [] to throw",
    wrote: ["test/EdgeCaseTest.java"],
  });
  assert.equal(finding.severity, "warning");
  assert.equal(finding.code, "adversarial_probe_failed");
});

test("the finding admits the probe may be wrong", () => {
  // A finding that asserted the implementation is broken would send people to
  // fix code that is correct. It has to name both readings.
  const finding = probeFinding("REQ-007", {
    ran: true,
    broke: true,
    detail: "",
    wrote: ["test/EdgeCaseTest.java"],
  });
  assert.match(finding.message, /defect the scenario does not cover/);
  assert.match(finding.message, /never promised/);
  assert.match(finding.fix, /the gate is\s+still the judge/);
});

test("the finding names the file the adversary wrote", () => {
  const finding = probeFinding("REQ-007", {
    ran: true,
    broke: true,
    detail: "",
    wrote: ["test/A.java", "test/B.java"],
  });
  assert.equal(finding.target, "test/A.java, test/B.java");
});

test("a probe that wrote nothing still names the requirement", () => {
  const finding = probeFinding("REQ-007", { ran: true, broke: true, detail: "", wrote: [] });
  assert.equal(finding.target, "REQ-007");
});

test("NO_PROBE is inert and frozen", () => {
  // It is shared, so a caller that mutated it would poison every later run.
  assert.equal(NO_PROBE.ran, false);
  assert.equal(NO_PROBE.broke, false);
  assert.ok(Object.isFrozen(NO_PROBE));
});
